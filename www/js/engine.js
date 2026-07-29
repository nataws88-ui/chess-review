/* 스톡피시 UCI 클라이언트 — 네이티브 프로세스(안드로이드)와 대화한다.
 * 검색은 한 번에 하나만 (엔진 프로세스가 하나이므로 큐로 직렬화) */

const N = () => (typeof window !== 'undefined' ? window.Native : null);

class Engine {
  constructor() {
    this.lines = [];          // 대기 중인 리스너
    this.started = false;
    this.deadReason = null;
    this.queue = Promise.resolve();
    this.id = { name: '', author: '' };
    this.options = { Threads: 2, Hash: 128 };
    this._install();
  }

  get available() {
    const n = N();
    return !!(n && typeof n.engineStart === 'function');
  }

  _install() {
    if (typeof window === 'undefined' || window.__engineLines) return;
    window.__engineLines = (arr) => {
      for (const line of arr) this._onLine(line);
    };
    window.__engineDead = (reason) => {
      this.started = false;
      this.deadReason = reason || 'engine stopped';
      for (const l of this.lines.slice()) l.onDead && l.onDead(this.deadReason);
    };
  }

  _onLine(line) {
    if (line.startsWith('id name')) this.id.name = line.slice(8).trim();
    for (const l of this.lines.slice()) l.onLine(line);
  }

  /** 특정 조건이 만족될 때까지 줄을 모은다 */
  _collect(isDone, timeoutMs) {
    return new Promise((resolve, reject) => {
      const got = [];
      const listener = {
        onLine: (line) => {
          got.push(line);
          if (isDone(line)) { done(); resolve(got); }
        },
        onDead: (why) => { done(); reject(new Error(why)); },
      };
      const t = setTimeout(() => {
        done();
        reject(new Error('엔진 응답 시간 초과'));
      }, timeoutMs);
      const done = () => {
        clearTimeout(t);
        const i = this.lines.indexOf(listener);
        if (i >= 0) this.lines.splice(i, 1);
      };
      this.lines.push(listener);
    });
  }

  send(cmd) {
    const n = N();
    if (n) n.engineSend(cmd);
  }

  /** 엔진 기동 + uci 핸드셰이크. 이미 떠 있으면 즉시 반환 */
  async start(opts = {}) {
    if (this.started) return true;
    const n = N();
    if (!n) throw new Error('이 화면은 앱에서만 동작합니다 (네이티브 엔진 없음)');
    const r = n.engineStart();
    if (r !== 'ok') throw new Error(r.replace(/^err:/, ''));
    this.deadReason = null;

    const cpus = (n.cpuCount && n.cpuCount()) || 4;
    this.options.Threads = Math.max(1, Math.min(8, cpus - 1));
    Object.assign(this.options, opts);

    const p = this._collect((l) => l.trim() === 'uciok', 15000);
    this.send('uci');
    await p;

    for (const [k, v] of Object.entries(this.options)) this.send(`setoption name ${k} value ${v}`);
    this.send('ucinewgame');
    const p2 = this._collect((l) => l.trim() === 'readyok', 15000);
    this.send('isready');
    await p2;

    this.started = true;
    return true;
  }

  /** 대국에서 낮춰놓은 강도가 분석에 새어 들어가지 않게 되돌린다 */
  _fullStrength() {
    if (!this._weakened) return;
    this.send('setoption name UCI_LimitStrength value false');
    this.send('setoption name Skill Level value 20');
    this._weakened = false;
  }

  stopSearch() { this.send('stop'); }

  quit() {
    const n = N();
    this.started = false;
    if (n) n.engineStop();
  }

  /** 큐에 넣어 하나씩 실행 */
  _serial(fn) {
    const run = this.queue.then(fn, fn);
    // 큐 자체는 실패해도 계속 굴러가야 한다
    this.queue = run.then(() => {}, () => {});
    return run;
  }

  /**
   * 한 국면 분석.
   * @returns {cp, mate, pv:[uci], best:uci, depth}  cp는 '둘 차례 쪽' 관점(UCI 원본)
   */
  analyse(fen, { movetime = 250, depth = null, nodes = null } = {}) {
    return this._serial(async () => {
      if (!this.started) await this.start();
      let best = null, info = null, lastDepth = 0;
      const budget = depth ? 60000 : (nodes ? 60000 : movetime * 6 + 8000);
      const collector = this._collect((l) => l.startsWith('bestmove'), budget);
      const parse = (line) => {
        if (line.startsWith('info ') && line.includes(' pv ') && line.includes(' score ')) {
          if (line.includes('lowerbound') || line.includes('upperbound')) return;
          const mpv = /multipv (\d+)/.exec(line);
          if (mpv && mpv[1] !== '1') return;
          const d = parseInt((/ depth (\d+)/.exec(line) || [])[1] || '0', 10);
          if (d >= lastDepth) { lastDepth = d; info = line; }
        } else if (line.startsWith('bestmove')) {
          best = line.split(/\s+/)[1];
        }
      };
      const listener = { onLine: parse, onDead: () => {} };
      this.lines.push(listener);
      try {
        this._fullStrength();
        this.send('position fen ' + fen);
        if (depth) this.send('go depth ' + depth);
        else if (nodes) this.send('go nodes ' + nodes);
        else this.send('go movetime ' + Math.round(movetime));
        await collector;
      } finally {
        const i = this.lines.indexOf(listener);
        if (i >= 0) this.lines.splice(i, 1);
      }
      return { ...parseInfo(info), best: best === '(none)' ? null : best, depth: lastDepth };
    });
  }

  /**
   * 후보수 여러 개를 한 번에 (💎 명수 판정용).
   * @returns [{cp, mate, pv}] — multipv 순서, cp는 '둘 차례 쪽' 관점
   */
  analyseMulti(fen, { movetime = 1000, multipv = 2 } = {}) {
    return this._serial(async () => {
      if (!this.started) await this.start();
      const best = new Map();     // multipv 번호 → {depth, line}
      const collector = this._collect((l) => l.startsWith('bestmove'), movetime * 6 + 8000);
      const listener = {
        onLine: (line) => {
          if (!line.startsWith('info ') || !line.includes(' pv ') || !line.includes(' score ')) return;
          if (line.includes('lowerbound') || line.includes('upperbound')) return;
          const k = parseInt((/multipv (\d+)/.exec(line) || [, '1'])[1], 10);
          const d = parseInt((/ depth (\d+)/.exec(line) || [, '0'])[1], 10);
          const cur = best.get(k);
          if (!cur || d >= cur.depth) best.set(k, { depth: d, line });
        },
        onDead: () => {},
      };
      this.lines.push(listener);
      try {
        this._fullStrength();
        this.send('setoption name MultiPV value ' + multipv);
        this.send('position fen ' + fen);
        this.send('go movetime ' + Math.round(movetime));
        await collector;
      } finally {
        const i = this.lines.indexOf(listener);
        if (i >= 0) this.lines.splice(i, 1);
        this.send('setoption name MultiPV value 1');
      }
      const out = [];
      for (let k = 1; k <= multipv; k++) {
        const e = best.get(k);
        out.push(e ? parseInfo(e.line) : null);
      }
      return out;
    });
  }

  /** 대국용: 강도 제한을 걸고 한 수 두게 한다 */
  play(fen, { movetime = 500, elo = null, skill = null } = {}) {
    return this._serial(async () => {
      if (!this.started) await this.start();
      if (elo) {
        this.send('setoption name Skill Level value 20');
        this.send('setoption name UCI_LimitStrength value true');
        this.send('setoption name UCI_Elo value ' + Math.max(1320, Math.min(3190, Math.round(elo))));
        this._weakened = true;
      } else if (skill != null) {
        this.send('setoption name UCI_LimitStrength value false');
        this.send('setoption name Skill Level value ' + Math.max(0, Math.min(20, skill)));
        this._weakened = true;
      } else {
        this._fullStrength();
      }
      let best = null, info = null;
      const collector = this._collect((l) => l.startsWith('bestmove'), movetime * 6 + 8000);
      const listener = {
        onLine: (line) => {
          if (line.startsWith('bestmove')) best = line.split(/\s+/)[1];
          else if (line.startsWith('info ') && line.includes(' score ') && line.includes(' pv ')) info = line;
        },
        onDead: () => {},
      };
      this.lines.push(listener);
      try {
        this.send('position fen ' + fen);
        this.send('go movetime ' + Math.round(movetime));
        await collector;
      } finally {
        const i = this.lines.indexOf(listener);
        if (i >= 0) this.lines.splice(i, 1);
      }
      return { best: best === '(none)' ? null : best, ...parseInfo(info) };
    });
  }
}

function parseInfo(line) {
  if (!line) return { cp: null, mate: null, pv: [] };
  const mate = /score mate (-?\d+)/.exec(line);
  const cp = /score cp (-?\d+)/.exec(line);
  const pv = /(?: pv )(.+)$/.exec(line);
  return {
    cp: cp ? parseInt(cp[1], 10) : null,
    mate: mate ? parseInt(mate[1], 10) : null,
    pv: pv ? pv[1].trim().split(/\s+/) : [],
  };
}

/** UCI 점수 → 파이썬판과 동일한 정수 스코어 (mate_score=10000) */
export function toScore({ cp, mate }) {
  if (mate != null) return mate > 0 ? 10000 - mate : -10000 - mate;
  return cp == null ? 0 : cp;
}

export const engine = new Engine();
export default engine;
