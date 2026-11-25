// Interactive storybook SVG diorama stages for all 13 Hanzi and mid/late island
// landmark puzzles. Pure view helper with zero state mutation or external asset requests.

import { tr } from '../../locale_runtime.js';
import { el } from './primitives.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}, children = []) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v !== undefined && v !== null) node.setAttribute(k, String(v));
    }
    for (const child of children) {
        if (child) node.append(child);
    }
    return node;
}

export const PUZZLE_STAGE_LAYOUTS = {
    'hanzi-road': {
        theme: 'hanzi-road',
        hotspots: [
            { xPct: 24, yPct: 30, tag: '往高处石阶' },
            { xPct: 76, yPct: 70, tag: '往村口低处' },
            { xPct: 50, yPct: 52, tag: '岔路正中央' },
        ],
    },
    'hanzi-canal': {
        theme: 'hanzi-canal',
        hotspots: [
            { xPct: 23, yPct: 48, tag: '东侧方格田' },
            { xPct: 77, yPct: 42, tag: '西侧大树林' },
            { xPct: 50, yPct: 74, tag: '渠边泥堤岸' },
        ],
    },
    'hanzi-weather': {
        theme: 'hanzi-weather',
        hotspots: [
            { xPct: 22, yPct: 36, tag: '清晨晒谷' },
            { xPct: 50, yPct: 30, tag: '午后聚云' },
            { xPct: 78, yPct: 38, tag: '落雨收谷' },
        ],
    },
    'hanzi-lantern': {
        theme: 'hanzi-lantern',
        hotspots: [
            { xPct: 22, yPct: 52, tag: '灯塔火盆' },
            { xPct: 50, yPct: 54, tag: '避风木门' },
            { xPct: 79, yPct: 60, tag: '树下歇脚' },
        ],
    },
    'hanzi-letter': {
        theme: 'hanzi-letter',
        hotspots: [
            { xPct: 24, yPct: 54, tag: '五指小泥印' },
            { xPct: 50, yPct: 44, tag: '码头远望窗' },
            { xPct: 76, yPct: 58, tag: '牵挂落款印' },
        ],
    },
    'hanzi-festival': {
        theme: 'hanzi-festival',
        hotspots: [
            { xPct: 22, yPct: 54, tag: '震天重鼓' },
            { xPct: 78, yPct: 56, tag: '掌心铃鼓' },
            { xPct: 50, yPct: 42, tag: '压轴欢舞' },
        ],
    },
    'fire-brazier': {
        theme: 'fire-brazier',
        hotspots: [
            { xPct: 22, yPct: 52, tag: '岩浆主道' },
            { xPct: 50, yPct: 44, tag: '强风山口' },
            { xPct: 78, yPct: 54, tag: '浓烟岔路' },
        ],
    },
    'ice-postbox': {
        theme: 'ice-postbox',
        hotspots: [
            { xPct: 22, yPct: 52, tag: '南岸货栈' },
            { xPct: 50, yPct: 44, tag: '冰原航标' },
            { xPct: 78, yPct: 54, tag: '守港急件' },
        ],
    },
    'desert-astrolabe': {
        theme: 'desert-astrolabe',
        hotspots: [
            { xPct: 23, yPct: 48, tag: '正午辨位' },
            { xPct: 50, yPct: 38, tag: '暗流泉脉' },
            { xPct: 77, yPct: 52, tag: '入夜商道' },
        ],
    },
    'dark-lantern': {
        theme: 'dark-lantern',
        hotspots: [
            { xPct: 22, yPct: 54, tag: '潮湿谷口' },
            { xPct: 50, yPct: 42, tag: '驱雾主灯' },
            { xPct: 78, yPct: 54, tag: '沼泽暗道' },
        ],
    },
    'tide-letters': {
        theme: 'tide-letters',
        hotspots: [
            { xPct: 23, yPct: 54, tag: '木桌两只杯' },
            { xPct: 50, yPct: 44, tag: '迟到旧信' },
            { xPct: 77, yPct: 54, tag: '灯塔交接' },
        ],
    },
    'float-charts': {
        theme: 'float-charts',
        hotspots: [
            { xPct: 23, yPct: 50, tag: '瀑布旧港' },
            { xPct: 50, yPct: 42, tag: '双图叠合' },
            { xPct: 77, yPct: 52, tag: '高桥通途' },
        ],
    },
    'sail-signals': {
        theme: 'sail-signals',
        hotspots: [
            { xPct: 23, yPct: 48, tag: '反挂红帆' },
            { xPct: 50, yPct: 56, tag: '旧名单册' },
            { xPct: 77, yPct: 38, tag: '塔顶回灯' },
        ],
    },
};

function buildSceneBackdrop(puzzleId, filledFlags, solved) {
    const [f0, f1, f2] = filledFlags;
    const svg = svgEl('svg', {
        class: 'island-puzzle-svg',
        viewBox: '0 0 640 220',
        preserveAspectRatio: 'xMidYMid slice',
        'aria-hidden': 'true',
    });

    const addRect = (x, y, w, h, fill, rx = 0, opacity = 1) =>
        svg.append(svgEl('rect', { x, y, width: w, height: h, fill, rx, opacity }));
    const addPath = (d, attrs) => svg.append(svgEl('path', { d, ...attrs }));
    const addCircle = (cx, cy, r, attrs) => svg.append(svgEl('circle', { cx, cy, r, ...attrs }));
    const addGlow = (cx, cy, r, color, active) => {
        if (!active) return;
        addCircle(cx, cy, r * 1.45, { fill: color, opacity: solved ? '0.32' : '0.2', class: 'stage-glow-ring' });
        addCircle(cx, cy, r * 0.8, { fill: color, opacity: solved ? '0.45' : '0.28' });
    };

    if (puzzleId === 'hanzi-road') {
        addRect(0, 0, 640, 220, '#e8dfc0');
        addPath('M0,150 L110,52 L225,130 L330,72 L460,145 L640,95 L640,220 L0,220 Z', { fill: '#b8c39b' });
        addPath('M0,170 L165,98 L325,155 L495,112 L640,162 L640,220 L0,220 Z', { fill: '#99b07f' });
        // Forking mountain stone path
        addPath('M320,126 C260,104 205,88 145,58', { fill: 'none', stroke: '#d8c7a0', 'stroke-width': 24, 'stroke-linecap': 'round' });
        addPath('M320,126 C380,145 435,160 510,185', { fill: 'none', stroke: '#d8c7a0', 'stroke-width': 24, 'stroke-linecap': 'round' });
        addPath('M320,126 L320,220', { fill: 'none', stroke: '#e5d7b4', 'stroke-width': 28 });
        // Village rooftops downhill
        addPath('M525,154 L558,132 L592,154 Z', { fill: '#a95d3d' });
        addRect(536, 154, 46, 26, '#f2e4c2', 2);
        addGlow(154, 68, 34, '#f8cc68', f0);
        addGlow(486, 154, 34, '#f8cc68', f1);
        addGlow(320, 114, 36, '#f8cc68', f2);
    } else if (puzzleId === 'hanzi-canal') {
        addRect(0, 0, 640, 220, '#e3edd7');
        // Checkered rice fields on east (left)
        addRect(26, 62, 180, 116, f0 || solved ? '#85be6c' : '#cabf92', 10);
        for (let r = 0; r < 3; r++) {
            addPath(`M34,${96 + r * 30} L198,${96 + r * 30}`, { stroke: f0 || solved ? '#5ea4c9' : '#9c8b64', 'stroke-width': 2.5 });
        }
        addPath('M116,66 L116,174', { stroke: f0 || solved ? '#5ea4c9' : '#9c8b64', 'stroke-width': 2.5 });
        // Forest on west (right)
        for (const [tx, ty] of [[470, 88], [520, 74], [568, 92], [500, 134], [552, 138]]) {
            addRect(tx - 4, ty + 14, 8, 20, '#785633', 2);
            addCircle(tx, ty, 24, { fill: f1 || solved ? '#498b57' : '#859676' });
        }
        // Main canal + branches
        addPath('M320,0 L320,115 C320,132 250,128 190,126', {
            fill: 'none',
            stroke: f0 || solved ? '#5eb6d8' : '#b7aa89',
            'stroke-width': 20,
            'stroke-linecap': 'round',
            class: f0 || solved ? 'stage-water-flow' : '',
        });
        addPath('M320,115 C320,132 390,118 465,112', {
            fill: 'none',
            stroke: f1 || solved ? '#5eb6d8' : '#b7aa89',
            'stroke-width': 20,
            'stroke-linecap': 'round',
            class: f1 || solved ? 'stage-water-flow' : '',
        });
        // Earth embankment
        addPath('M250,168 Q320,150 390,168 L390,206 L250,206 Z', { fill: f2 || solved ? '#9c7143' : '#bfa179' });
        addGlow(148, 108, 30, '#7dd3ee', f0);
        addGlow(492, 94, 30, '#8dd89e', f1);
        addGlow(320, 166, 32, '#f5c76e', f2);
    } else if (puzzleId === 'hanzi-weather') {
        // Sky gradient sections: morning -> noon -> rain
        addRect(0, 0, 214, 150, f0 || solved ? '#fce09b' : '#ebe2c8');
        addRect(214, 0, 212, 150, f1 || solved ? '#cfe0ea' : '#e2dfd0');
        addRect(426, 0, 214, 150, f2 || solved ? '#9bb8cc' : '#d5d8dc');
        addRect(0, 146, 640, 74, '#b89f6b');
        // Drying grain mat
        addRect(60, 162, 130, 34, '#e5c16d', 6);
        addRect(265, 162, 120, 34, '#d9b565', 6);
        addRect(468, 162, 118, 34, f2 || solved ? '#7b99ad' : '#cbb278', 6);
        // Sun, cloud, rain cues
        addCircle(140, 72, 26, { fill: f0 || solved ? '#f5a638' : '#d6c69e' });
        addPath('M286,78 Q296,52 322,58 Q340,46 356,64 Q372,66 368,84 L286,84 Z', { fill: f1 || solved ? '#ffffff' : '#d8dde0' });
        if (f2 || solved) {
            for (let i = 0; i < 6; i++) {
                addPath(`M${462 + i * 24},62 L${454 + i * 24},118`, { stroke: '#e8f5ff', 'stroke-width': 3, 'stroke-linecap': 'round' });
            }
        }
        addGlow(140, 78, 34, '#ffd36b', f0);
        addGlow(320, 66, 34, '#ffffff', f1);
        addGlow(500, 84, 34, '#a2d9f7', f2);
    } else if (puzzleId === 'hanzi-lantern') {
        addRect(0, 0, 640, 220, '#2a384e');
        addRect(0, 148, 640, 72, '#3d4c55');
        // Lighthouse & cottage silhouette
        addRect(256, 72, 128, 92, '#705842', 4);
        addPath('M240,76 L320,34 L400,76 Z', { fill: '#573b2c' });
        addRect(298, 108, 44, 56, f1 || solved ? '#f7ca72' : '#4a3628', 4);
        // Brazier left
        addPath('M120,152 L162,152 L152,174 L130,174 Z', { fill: '#544a44' });
        if (f0 || solved) addPath('M141,112 Q158,132 141,150 Q124,132 141,112 Z', { fill: '#ff9b42' });
        // Tree & bench right
        addRect(516, 104, 12, 56, '#5c4128');
        addCircle(522, 86, 32, { fill: '#355c47' });
        addRect(472, 148, 56, 12, '#8b633c', 3);
        addGlow(141, 118, 42, '#ffb65c', f0);
        addGlow(320, 122, 42, '#ffe08a', f1);
        addGlow(504, 134, 42, '#f9d27a', f2);
    } else if (puzzleId === 'hanzi-letter') {
        addRect(0, 0, 640, 220, '#806142');
        // Unrolled sea-worn parchment letter
        addRect(56, 26, 528, 168, '#f6e7c3', 12);
        addRect(72, 40, 496, 140, '#fbf1d7', 8);
        for (let y = 66; y <= 150; y += 22) {
            addPath(`M100,${y} L540,${y}`, { stroke: '#d6be8d', 'stroke-width': 1.4, 'stroke-dasharray': '6 5' });
        }
        // Decorative seal rings
        addCircle(154, 120, 30, { fill: f0 || solved ? '#e4b884' : '#e7d7b3', stroke: '#b28652', 'stroke-width': 2 });
        addRect(284, 72, 72, 54, f1 || solved ? '#cbe5f0' : '#e7d7b3', 6);
        addCircle(486, 128, 28, { fill: f2 || solved ? '#d45a47' : '#e7d7b3', stroke: '#a9483a', 'stroke-width': 2 });
        addGlow(154, 120, 34, '#f4ba68', f0);
        addGlow(320, 98, 34, '#92d2eb', f1);
        addGlow(486, 128, 34, '#ef7a68', f2);
    } else if (puzzleId === 'hanzi-festival') {
        addRect(0, 0, 640, 220, '#36273c');
        addRect(0, 144, 640, 76, '#654c3b');
        // Hanzi Pavilion roof
        addPath('M190,82 L320,26 L450,82 Z', { fill: '#b54634' });
        addRect(236, 82, 12, 72, '#9e3828');
        addRect(392, 82, 12, 72, '#9e3828');
        // Drums left & right
        addCircle(142, 124, 30, { fill: '#c85038', stroke: '#f3d189', 'stroke-width': 4 });
        addCircle(500, 126, 20, { fill: '#df9444', stroke: '#f7e0a8', 'stroke-width': 3 });
        // Festive lantern string
        addPath('M40,42 Q320,86 600,42', { fill: 'none', stroke: '#d6a856', 'stroke-width': 2 });
        for (const [lx, ly, col] of [[104, 54, '#f6c562'], [216, 66, '#f27c5c'], [424, 66, '#87d49c'], [536, 54, '#7dc4e8']]) {
            addCircle(lx, ly, solved ? 11 : 8, { fill: col, opacity: f0 || f1 || f2 || solved ? '0.95' : '0.45' });
        }
        addGlow(142, 120, 38, '#ffb85c', f0);
        addGlow(500, 124, 34, '#ffd778', f1);
        addGlow(320, 94, 46, '#ffcf6e', f2);
    } else if (puzzleId === 'fire-brazier') {
        addRect(0, 0, 640, 220, '#3e231c');
        addPath('M0,152 L140,86 L280,140 L430,74 L640,148 L640,220 L0,220 Z', { fill: '#5b2d22' });
        addPath('M0,185 Q320,148 640,185 L640,220 L0,220 Z', { fill: '#d65c29', opacity: '0.55' });
        for (const [bx, by, on] of [[142, 134, f0], [320, 114, f1], [500, 136, f2]]) {
            addPath(`M${bx - 24},${by} L${bx + 24},${by} L${bx + 16},${by + 24} L${bx - 16},${by + 24} Z`, { fill: '#7e4d32' });
            addGlow(bx, by - 14, 38, '#ff9c3b', on);
        }
    } else if (puzzleId === 'ice-postbox') {
        addRect(0, 0, 640, 220, '#b9daf0');
        addPath('M0,136 Q180,104 340,132 T640,124 L640,220 L0,220 Z', { fill: '#7bb5d9' });
        addPath('M40,158 L195,142 L260,174 L102,190 Z', { fill: '#eaf6ff' });
        addPath('M260,136 L402,126 L444,160 L294,170 Z', { fill: '#f0f9ff' });
        addPath('M445,152 L598,138 L615,176 L472,188 Z', { fill: '#eaf6ff' });
        addGlow(142, 114, 36, '#ffe082', f0);
        addGlow(320, 96, 36, '#ffe082', f1);
        addGlow(500, 118, 36, '#ffe082', f2);
    } else if (puzzleId === 'desert-astrolabe') {
        addRect(0, 0, 640, 220, '#eed18e');
        addPath('M0,148 Q160,102 320,136 T640,122 L640,220 L0,220 Z', { fill: '#d7a85c' });
        // Oasis pool & golden astrolabe rings
        addCircle(320, 110, 66, { fill: 'none', stroke: '#9f6e27', 'stroke-width': 3.5, 'stroke-dasharray': solved ? 'none' : '8 6' });
        addCircle(320, 110, 42, { fill: f1 || solved ? '#5eb9cc' : '#c69952', opacity: '0.78' });
        addGlow(148, 108, 34, '#ffd76a', f0);
        addGlow(320, 86, 38, '#7de0f2', f1);
        addGlow(494, 116, 34, '#ffe18b', f2);
    } else if (puzzleId === 'dark-lantern') {
        addRect(0, 0, 640, 220, '#222036');
        addPath('M0,150 Q160,120 320,148 T640,136 L640,220 L0,220 Z', { fill: '#312f4a' });
        // Mist bands fading as lamps light up
        const fogOpacity = solved ? 0.08 : Math.max(0.14, 0.48 - [f0, f1, f2].filter(Boolean).length * 0.12);
        addRect(0, 56, 640, 44, '#7d739e', 0, fogOpacity);
        addRect(0, 110, 640, 38, '#69628b', 0, fogOpacity);
        addGlow(142, 120, 40, '#7ef5b8', f0);
        addGlow(320, 94, 44, '#92f9c9', f1);
        addGlow(500, 120, 40, '#7ef5b8', f2);
    } else if (puzzleId === 'tide-letters') {
        addRect(0, 0, 640, 220, '#2c4157');
        addRect(0, 128, 640, 92, '#7d5b3b');
        // Two warm teacups & envelopes on harbor table
        addCircle(148, 124, 24, { fill: '#f2e6cf', stroke: '#8c6943', 'stroke-width': 3 });
        addRect(272, 82, 96, 56, '#f7e9c8', 6);
        addPath('M272,84 L320,114 L368,84', { fill: 'none', stroke: '#c5a268', 'stroke-width': 2.5 });
        addGlow(148, 118, 36, '#ffd275', f0);
        addGlow(320, 98, 38, '#ffe294', f1);
        addGlow(494, 118, 36, '#ffd275', f2);
    } else if (puzzleId === 'float-charts') {
        addRect(0, 0, 640, 220, '#36546a');
        // Overlapping old & new nautical charts
        addRect(70, 36, 260, 148, '#f0deb2', 8);
        addRect(310, 36, 260, 148, '#e8d4a6', 8);
        addPath('M120,112 Q320,66 520,112', {
            fill: 'none',
            stroke: f1 || solved ? '#d48b28' : '#9c8356',
            'stroke-width': f1 || solved ? 5 : 2.5,
            'stroke-dasharray': f1 || solved ? 'none' : '7 6',
        });
        addCircle(320, 94, 34, { fill: 'none', stroke: '#b48236', 'stroke-width': 2.5 });
        addGlow(148, 110, 34, '#88d6eb', f0);
        addGlow(320, 92, 40, '#f9cc66', f1);
        addGlow(494, 114, 34, '#f6c35c', f2);
    } else {
        // sail-signals & generic archipelago harbor
        addRect(0, 0, 640, 220, '#22354f');
        addPath('M0,152 Q160,136 320,152 T640,148 L640,220 L0,220 Z', { fill: '#35587c' });
        // Red pennant mast & lighthouse tower
        addRect(142, 48, 8, 116, '#c7a472');
        addPath('M150,56 L204,74 L150,92 Z', { fill: '#d44b3c' });
        addRect(472, 46, 44, 118, '#e6d6b4', 6);
        addPath('M464,50 L494,24 L524,50 Z', { fill: '#b34636' });
        addGlow(148, 106, 36, '#ff8b6b', f0);
        addGlow(320, 124, 36, '#f6d178', f1);
        addGlow(494, 84, 42, '#ffe082', f2);
    }

    return svg;
}

export function renderIslandPuzzleStage({
    puzzle,
    answers,
    activeIndex,
    wrongSlotIndex,
    solved,
    onSelectSlot,
}) {
    const layout = PUZZLE_STAGE_LAYOUTS[puzzle.id] || {
        theme: 'default',
        hotspots: puzzle.slots.map((_, i) => ({
            xPct: 22 + i * 28,
            yPct: 50,
            tag: `位置 ${i + 1}`,
        })),
    };

    const optionMap = new Map(puzzle.options.map(o => [o.id, o]));
    const filledFlags = puzzle.slots.map((_, idx) => Boolean(answers[idx]));

    const stage = el(
        'div',
        `island-puzzle-stage theme-${layout.theme}${solved ? ' is-restored' : ''}`,
    );
    stage.setAttribute('role', 'region');
    stage.setAttribute('aria-label', tr('现场实景机关舞台'));

    stage.append(buildSceneBackdrop(puzzle.id, filledFlags, solved));

    const overlay = el('div', 'island-puzzle-hotspots');
    puzzle.slots.forEach((slot, idx) => {
        const spot = layout.hotspots[idx] || { xPct: 24 + idx * 26, yPct: 50, tag: `位置 ${idx + 1}` };
        const picked = answers[idx] ? optionMap.get(answers[idx]) : null;
        const isCurrent = !solved && activeIndex === idx;
        const isWrong = !solved && wrongSlotIndex === idx;

        const pin = document.createElement('button');
        pin.type = 'button';
        pin.className = [
            'stage-hotspot',
            isCurrent ? 'is-active' : '',
            picked ? 'is-filled' : 'is-empty',
            isWrong ? 'is-wrong' : '',
            solved ? 'is-solved' : '',
        ].filter(Boolean).join(' ');
        pin.style.left = `${spot.xPct}%`;
        pin.style.top = `${spot.yPct}%`;
        pin.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
        pin.setAttribute(
            'aria-label',
            `${idx + 1}. ${tr(spot.tag)}：${picked ? tr(picked.label) : tr('待安放')}`,
        );
        pin.onclick = () => onSelectSlot?.(idx);

        const plaque = el('span', 'stage-hotspot-plaque', picked ? tr(picked.label) : '？');
        const caption = el('span', 'stage-hotspot-tag', `${idx + 1} · ${tr(spot.tag)}`);
        pin.append(plaque, caption);
        overlay.append(pin);
    });

    stage.append(overlay);
    return stage;
}
