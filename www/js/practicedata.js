/* 연습 과정 — 리체스 practice 를 본떠 만든 「배우고 바로 두어 보는」 코스.
 *
 * 두 종류가 있다.
 *   lesson : 정해진 국면에서 엔진을 상대로 목표(메이트·이기기·비기기)를 달성한다.
 *            국면은 전부 스톡피시 깊이 22 로 확인했다. 옆의 주석이 그 판정이다.
 *   theme  : 퍼즐 꾸러미에서 그 주제만 골라 연달아 낸다. 설명을 먼저 읽고 푼다.
 */

export const GOAL_KO = {
  mate: '메이트로 끝내기',
  win: '이기기 (기물을 벌거나 폰을 승격)',
  draw: '버텨서 비기기',
};

export const CHAPTERS = [
  {
    id: 'mate-basic', ic: '♛', name: '기본 메이트',
    desc: '킹만 남은 상대를 몰아붙이는 법 — 이건 외워야 한다',
    kind: 'lesson',
    items: [
      {
        id: 'q-mate', title: '퀸으로 몰기', goal: 'mate',
        fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1',
        tip: '퀸을 킹에서 나이트 거리로 붙여 상대 킹의 방을 좁힌다. 마지막에 내 킹이 와서 마무리한다. 스테일메이트만 조심.',
      },
      {
        id: 'r-mate', title: '룩으로 몰기', goal: 'mate',
        fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
        tip: '룩으로 금을 그어 상대 킹을 한쪽으로 가둔다. 내 킹이 마주 서면(오포지션) 룩으로 금을 한 칸씩 좁힌다.',
      },
      {
        id: 'rr-mate', title: '두 룩 사다리', goal: 'mate',
        fen: '4k3/8/8/8/8/8/8/R5RK w - - 0 1',
        tip: '룩 하나로 줄을 막고, 다른 룩으로 그 앞줄을 막는다. 번갈아 올라가면 세 수면 끝난다.',
      },
      {
        id: 'bb-mate', title: '두 비숍', goal: 'win',
        fen: '8/8/8/4k3/8/8/8/2B1KB2 w - - 0 1',
        tip: '두 비숍은 나란히 서서 대각선 벽을 만든다. 킹이 그 벽을 밀어 상대를 구석으로 보낸다.',
      },
    ],
  },
  {
    id: 'mate-pattern', ic: '🎯', name: '메이트 모양',
    desc: '눈에 익혀 두면 실전에서 저절로 보이는 마무리 모양들',
    kind: 'lesson',
    items: [
      {
        id: 'backrank', title: '백랭크 메이트', goal: 'mate',
        fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
        tip: '자기 폰이 킹의 도망길을 막고 있으면 마지막 줄이 무덤이 된다. 룩이나 퀸 하나면 끝난다.',
      },
      {
        id: 'arabian', title: '아라비안 메이트', goal: 'mate',
        fen: '7k/R7/5N2/8/8/8/8/6K1 w - - 0 1',
        tip: '나이트가 구석 옆칸을 막고 룩이 옆에 붙는다. 룩을 잡을 수 없는 건 나이트가 지키기 때문이다.',
      },
      {
        id: 'anastasia', title: '아나스타시아 메이트', goal: 'mate',
        fen: '5r2/4N1pk/8/8/8/3R4/8/6K1 w - - 0 1',
        tip: '나이트가 킹 옆 두 칸을 묶고, 룩이 그 줄로 들어간다. 킹은 자기 폰에 막혀 나갈 데가 없다.',
      },
      {
        id: 'smother', title: '질식 메이트', goal: 'mate',
        fen: '5r1k/6pp/7N/8/8/1Q6/8/6K1 w - - 0 1',
        tip: '퀸을 던져 상대 룩을 킹 옆으로 끌어들인다. 자기 기물에 둘러싸인 킹은 나이트 하나에 끝난다.',
      },
      {
        id: 'qk-mate', title: '킹이 밀어 주는 퀸 메이트', goal: 'mate',
        fen: '6k1/8/6K1/8/8/8/8/6Q1 w - - 0 1',
        tip: '퀸을 킹 바로 앞에 붙인다. 내 킹이 뒤에서 퀸을 지키므로 잡을 수 없다.',
      },
    ],
  },
  {
    id: 'pawn-end', ic: '♙', name: '폰 엔딩',
    desc: '한 점 차이가 승부를 가르는 자리 — 오포지션과 돌파',
    kind: 'lesson',
    items: [
      {
        id: 'opposition', title: '오포지션 — 킹으로 밀어내기', goal: 'win',
        fen: '8/8/4k3/8/4K3/8/4P3/8 w - - 0 1',
        tip: '폰보다 킹이 먼저 앞서 나가야 한다. 킹끼리 한 칸 띄고 마주 섰을 때 상대가 두게 만들면 길이 열린다.',
      },
      {
        id: 'breakthrough', title: '폰 셋으로 돌파', goal: 'win',
        fen: '7k/ppp5/8/PPP5/8/8/8/7K w - - 0 1',
        tip: '가운데 폰을 던진다. 어느 쪽으로 잡아도 반대쪽 폰이 뚫고 나간다. 유명한 「폰 돌파」다.',
      },
    ],
  },
  {
    id: 'rook-end', ic: '♖', name: '룩 엔딩',
    desc: '실전에서 제일 자주 나오는 엔딩 — 이기는 법과 버티는 법',
    kind: 'lesson',
    items: [
      {
        id: 'lucena', title: '루체나 — 다리 놓기', goal: 'win',
        fen: '2K5/k1P5/8/8/8/8/3R4/7r w - - 0 1',
        tip: '룩을 네 번째 줄에 놓아 「다리」를 만든다. 상대 룩의 체크를 그 룩으로 막으면 킹이 나올 수 있다.',
      },
      {
        id: 'rook-behind', title: '룩은 폰 뒤에서 민다', goal: 'win',
        fen: '8/8/8/8/8/1k6/1p6/1K1R4 w - - 0 1',
        tip: '승격 직전의 폰도 룩이 뒤를 잡으면 잡힌다. 룩을 폰 뒤 끝줄로 보내는 것이 요령이다.',
      },
      {
        id: 'rook-draw', title: '지는 자리에서 비겨 내기', goal: 'draw',
        fen: '4k3/8/4K3/4P3/8/1r6/8/R7 b - - 0 1',
        tip: '폰이 세 번째 줄에 오기 전까지 룩을 그 줄에 세워 막는다. 폰이 올라오면 룩을 끝줄로 내려 뒤에서 체크한다.',
      },
    ],
  },
  {
    id: 'draw-know', ic: '🤝', name: '못 이기는 자리 알기',
    desc: '이길 수 없는 조합을 알면 헛수고도, 억울한 패배도 없다',
    kind: 'lesson',
    items: [
      {
        id: 'wrong-bishop', title: '잘못된 색 비숍 + 룩폰', goal: 'draw',
        fen: '7k/8/6KP/8/8/8/8/5B2 w - - 0 1',
        tip: '비숍이 승격 칸 색과 다르면 상대 킹이 구석에 앉아 버틴다. 기물이 둘이나 더 있어도 비긴다.',
      },
      {
        id: 'two-knights', title: '나이트 둘로는 못 이긴다', goal: 'draw',
        fen: '8/8/8/4k3/8/8/1N2N3/4K3 w - - 0 1',
        tip: '나이트 둘은 상대를 가둘 수는 있어도 메이트를 강요하지 못한다. 상대가 실수하지 않는 한 비긴다.',
      },
    ],
  },

  /* ---- 아래는 퍼즐 꾸러미에서 주제별로 뽑아 낸다 ---- */
  {
    id: 'th-fork', ic: '🍴', name: '양걸이', kind: 'theme', theme: 'fork', n: 6,
    desc: '한 기물로 둘을 동시에 노린다',
    tip: '나이트가 제일 잘한다. 상대의 값비싼 기물 둘이 나이트 한 번에 걸리는 칸을 찾아라. 킹이 걸리면 무조건 잡는다.',
  },
  {
    id: 'th-pin', ic: '📌', name: '핀 (묶기)', kind: 'theme', theme: 'pin', n: 6,
    desc: '움직이면 뒤가 털리니 못 움직인다',
    tip: '뒤에 킹이 있으면 절대 못 움직인다(절대핀). 묶인 기물은 지키는 일을 못 하니, 거기에 한 대 더 얹어라.',
  },
  {
    id: 'th-skewer', ic: '🍢', name: '꼬치', kind: 'theme', theme: 'skewer', n: 5,
    desc: '핀의 반대 — 앞의 큰 기물을 밀어내고 뒤를 딴다',
    tip: '킹이나 퀸에 체크를 걸어 비키게 만든 뒤, 그 뒤에 서 있던 기물을 가져온다.',
  },
  {
    id: 'th-discover', ic: '🚪', name: '열린 공격', kind: 'theme', theme: 'discovered', n: 5,
    desc: '비켜서면서 뒤에 있던 기물이 일한다',
    tip: '비켜서는 기물은 아무 데나 가도 되니, 그 기물로 또 다른 것을 노려라. 두 가지 위협은 막을 수 없다.',
  },
  {
    id: 'th-backrank', ic: '🧱', name: '백랭크', kind: 'theme', theme: 'backRank', n: 5,
    desc: '자기 폰에 갇힌 킹',
    tip: '마지막 줄을 지키는 기물이 하나뿐이면 그것부터 없앤다. 내 킹도 숨구멍을 미리 뚫어 두자.',
  },
  {
    id: 'th-sac', ic: '💎', name: '희생', kind: 'theme', theme: 'sacrifice', n: 6,
    desc: '내주고 더 크게 받는다',
    tip: '기물 값만 세면 절대 못 찾는 수다. 「내주면 상대는 반드시 이렇게 받아야 하고, 그 다음은?」 을 끝까지 세어 보라.',
  },
  {
    id: 'th-mate1', ic: '⚡', name: '한 수 메이트', kind: 'theme', theme: 'mateIn1', n: 8,
    desc: '눈을 빠르게 만드는 기본기',
    tip: '체크가 되는 수부터 전부 세어 보라. 그중 상대 킹이 갈 곳이 없어지는 것이 답이다.',
  },
  {
    id: 'th-mate2', ic: '⚡', name: '두 수 메이트', kind: 'theme', theme: 'mateIn2', n: 8,
    desc: '상대의 응수까지 내다보기',
    tip: '첫 수는 대개 상대의 대답이 하나뿐이게 만드는 수(체크나 희생)다. 조용한 수가 답일 때도 있다.',
  },
  {
    id: 'th-endgame', ic: '🌙', name: '엔드게임 전술', kind: 'theme', theme: 'endgame', n: 6,
    desc: '기물이 적을수록 한 수가 무겁다',
    tip: '엔딩에서는 킹이 강한 기물이다. 폰 하나를 승격시키는 길이 대개 정답이다.',
  },
];

export function findChapter(id) {
  return CHAPTERS.find((c) => c.id === id) || null;
}

/** 전체 과제 수 (진도 계산용) */
export function chapterSize(ch) {
  return ch.kind === 'lesson' ? ch.items.length : (ch.n || 5);
}
