// 补录「泉」独立故事页的三语词条：node scripts/prepare_hanzi_quan_locales.mjs [--check]
import fs from 'node:fs';
import { parseLocaleFile, formatLocaleLine } from '../js/locale_core.js';

// 每行：[中文, en, ja, ko]
const rows = [
  // 品牌与开场
  ['一字一画卷', 'One Character, One Scroll', '一字一絵巻', '한 글자 한 그림'],
  ['月夜山水 · 汉字故事', 'Moonlit Landscape · A Hanzi Story', '月夜の山水 · 漢字ものがたり', '달밤 산수 · 한자 이야기'],
  ['泉 · 明月松间，清泉石上', 'Quan · Moonlight through pines, a clear spring over stones', '泉 · 明月松間、清泉石上', '천(泉) · 솔밭의 달빛, 돌 위 맑은 샘'],
  ['空山新雨后，天气晚来秋——听，石头缝里藏着一眼泉。', 'After fresh rain the empty hills turn autumnal at dusk—listen, a spring hides in a crack of stone.', '空山に新雨の後、天気晩来秋——聞いて、石の割れ目に泉がひとつ隠れています。', '빈 산에 갓 비가 내린 뒤 저녁엔 가을 기운——들어 보세요, 돌 틈에 샘 하나가 숨어 있어요.'],
  ['约三分钟 · 寻声凿泉、九笔描红与月夜余韵 · 建议开启声音', 'About 3 minutes · Find the sound, open the spring, trace 9 strokes, linger in moonlight · Sound recommended', '約3分 · 音をたどり泉を開き、九画をなぞり、月夜の余韻へ · 音声オン推奨', '약 3분 · 소리를 찾고 샘을 열고, 아홉 획을 따라 쓰고, 달밤의 여운까지 · 소리 켜기 권장'],
  ['上「白」本象泉穴之形，下「水」象涌流；古文字为艺术示意，描红笔顺依规范楷书。', 'The upper part pictures a spring cave, the lower part flowing water; ancient forms are artistic impressions, while tracing follows standard regular-script stroke order.', '上の「白」は泉の穴の形、下の「水」は湧き流れる様子。古文字は芸術的な示意で、なぞり書きは規範楷書の筆順に従います。', '위쪽 「白」은 샘굴의 모양, 아래쪽 「水」는 솟아 흐르는 물입니다. 고문자는 예술적 표현이며 따라 쓰기는 표준 해서 획순을 따릅니다.'],

  // 进度与幕名
  ['空山', 'Empty Hills', '空山', '빈 산'],
  ['寻声', 'Following Sound', '音をたどる', '소리 찾기'],
  ['泉涌', 'Spring Gushing', '泉の湧き', '샘이 솟다'],

  // 第一幕 空山
  ['空山新雨后，夜色像刚洗过一样干净。', 'After fresh rain, the night is as clean as if just washed.', '新雨の後の空山、夜色は洗いたてのように清らかです。', '갓 비가 내린 빈 산, 밤빛은 막 씻어 낸 듯 맑아요.'],
  ['一轮明月升上松梢，山静得能听见自己的呼吸。', 'A bright moon rises above the pines; the hills are so still you can hear your own breathing.', '明るい月が松の梢に昇り、山は自分の呼吸が聞こえるほど静かです。', '밝은 달이 솔가지 위로 오르고, 산은 내 숨소리까지 들릴 만큼 고요해요.'],
  ['可是——听，石头里好像藏着细细的水声。', 'But—listen, a thin thread of water seems to hide inside the stone.', 'でも——聞いて、石の中に細い水音が隠れているようです。', '그런데——들어 보세요, 돌 속에 가느다란 물소리가 숨어 있는 것 같아요.'],

  // 第二幕 寻声
  ['点一点发亮的水纹，听见三处回声就能找到泉眼', 'Tap the glowing ripples; hear three echoes to find the spring head', '光る水紋をタップして、三つの反響を聞くと泉の口が見つかります', '빛나는 물결을 눌러 세 곳의 메아리를 들으면 샘터를 찾을 수 있어요'],
  ['回声 1 / 3 · 再听听别处', 'Echo 1 / 3 · Listen somewhere else', '反響 1 / 3 · ほかの場所も聞いて', '메아리 1 / 3 · 다른 곳도 들어 보세요'],
  ['回声 2 / 3 · 再听听别处', 'Echo 2 / 3 · Listen somewhere else', '反響 2 / 3 · ほかの場所も聞いて', '메아리 2 / 3 · 다른 곳도 들어 보세요'],
  ['听一处水声', 'Hear a Water Sound', '水音をひとつ聞く', '물소리 하나 듣기'],
  ['三处回声连成一条线，都指向崖壁上那个湿湿的黑洞口。', 'The three echoes line up, all pointing to that damp dark opening on the cliff.', '三つの反響が一本の線になり、崖の湿った黒い洞口を指しています。', '세 메아리가 한 줄로 이어져, 절벽의 축축하고 검은 굴 입구를 가리켜요.'],

  // 第三幕 泉涌
  ['把手放在石缝上，轻轻叩一叩——山肚子里的水醒了吗？', 'Rest your hand on the crack and knock gently—is the water inside the mountain awake?', '石の割れ目に手を置いて、そっと叩いて——山のお腹の水は目覚めたかな？', '돌 틈에 손을 얹고 살살 두드려 보세요——산 뱃속의 물이 깨어났을까요?'],
  ['点一点泉眼，叩开石缝，让泉水涌出来', 'Tap the spring head to knock the crack open and let the water gush out', '泉の口をタップして石の割れ目を叩き開き、泉水を湧き出させよう', '샘터를 눌러 돌 틈을 두드려 열고 샘물이 솟게 하세요'],
  ['再叩 2 下，石缝就要开了', 'Knock 2 more times and the crack will open', 'あと2回叩くと、石の割れ目が開きます', '두 번만 더 두드리면 돌 틈이 열려요'],
  ['再叩 1 下，石缝就要开了', 'Knock 1 more time and the crack will open', 'あと1回叩くと、石の割れ目が開きます', '한 번만 더 두드리면 돌 틈이 열려요'],
  ['叩开石缝', 'Knock the Crack Open', '石の割れ目を叩き開く', '돌 틈 두드려 열기'],
  ['哗——一股清泉从石头心里涌了出来！', 'Whoosh—a clear spring bursts out from the heart of the stone!', 'ざあ——清らかな泉が石の芯から湧き出しました！', '콸——맑은 샘이 돌 한가운데서 솟아 나왔어요!'],
  ['泉水跳过一层层山石，落成小瀑，汇进一潭月色。', 'The water leaps over ledge after ledge, falls into a small cascade, and gathers into a pool of moonlight.', '泉水は幾層もの山石を跳び、小さな滝となって、月の色の潭に集まります。', '샘물이 층층이 돌을 뛰어 작은 폭포가 되고, 달빛 담긴 못으로 모여요.'],

  // 第四幕 成字
  ['古人画一个泉穴，穴里点着水，穴下画出水往外流的样子。', 'The ancients drew a spring cave with water inside it, and water flowing out below.', '古人は泉の穴を描き、穴の中に水を点じ、穴の下に水が流れ出る様子を描きました。', '옛사람들은 샘굴을 그리고 굴 안에 물을 찍고, 굴 아래로 물이 흘러나오는 모양을 그렸어요.'],
  ['小篆把泉穴写得端端正正，水脉在下方舒展开来。', 'Small seal script sets the cave upright and lets the water veins spread below.', '小篆は泉の穴を端正に書き、水脈が下で伸びやかに広がります。', '소전은 샘굴을 반듯하게 쓰고, 물줄기가 아래에서 펼쳐지게 했어요.'],
  ['楷书上半是「白」形的泉穴，下半就是「水」——泉，就是石头里流出来的水。', 'In regular script the top is a cave shaped like 白 and the bottom is 水—Quan is water flowing out of stone.', '楷書の上半は「白」の形の泉穴、下半はそのまま「水」——泉とは、石から流れ出る水です。', '해서의 위쪽은 「白」 모양의 샘굴, 아래쪽은 그대로 「水」——천(泉)은 돌에서 흘러나오는 물이에요.'],
  ['白 · 泉穴之形', '白 · Shape of the spring cave', '白 · 泉穴の形', '白 · 샘굴의 모양'],
  ['水 · 涌流四散', '水 · Water gushing and spreading', '水 · 湧き流れ四方に散る', '水 · 솟아 흘러 퍼짐'],

  // 第五幕 写字
  ['「泉」一共九笔，先写上面的白，再写下面的水。', 'Quan has nine strokes: write the upper 白 first, then the lower 水.', '「泉」は全部で九画。まず上の白、次に下の水を書きます。', '「泉」은 모두 아홉 획이에요. 위쪽 白을 먼저, 아래쪽 水를 나중에 써요.'],
  ['写好了！泉，山泉的泉。', 'Well done! Quan, as in mountain spring.', '書けました！泉、山泉の泉です。', '다 썼어요! 천(泉), 산속 샘물의 천이에요.'],
  ['从这一笔的红点开始哦', 'Start from the red dot of this stroke', 'この画の赤い点から始めてね', '이 획의 빨간 점에서 시작하세요'],
  ['顺着虚线方向写到箭头附近即可', 'Follow the dashed line and write to near the arrow', '破線の方向に沿って矢印の近くまで書けば大丈夫', '점선 방향을 따라 화살표 근처까지 쓰면 돼요'],
  ['看笔尖光点走过每一笔', 'Watch the glowing pen tip travel each stroke', 'ペン先の光が各画をたどるのを見て', '펜 끝의 빛이 각 획을 지나가는 걸 보세요'],
  ['写不出来也没关系，点“看示范”', 'It is fine if you cannot write it—tap "Watch Demo"', '書けなくても大丈夫、「お手本を見る」をタップ', '잘 안 써져도 괜찮아요. "시범 보기"를 눌러요'],
  ['撇：从红点起笔，顺着虚线写', 'Left-falling: start at the red dot and follow the dashed line', '払い：赤い点から書き始め、破線に沿って', '삐침: 빨간 점에서 시작해 점선을 따라 쓰세요'],
  ['竖：从红点起笔，顺着虚线写', 'Vertical: start at the red dot and follow the dashed line', '縦画：赤い点から書き始め、破線に沿って', '세로획: 빨간 점에서 시작해 점선을 따라 쓰세요'],
  ['横折：从红点起笔，顺着虚线写', 'Horizontal-turn: start at the red dot and follow the dashed line', '横折れ：赤い点から書き始め、破線に沿って', '가로꺾임: 빨간 점에서 시작해 점선을 따라 쓰세요'],
  ['横：从红点起笔，顺着虚线写', 'Horizontal: start at the red dot and follow the dashed line', '横画：赤い点から書き始め、破線に沿って', '가로획: 빨간 점에서 시작해 점선을 따라 쓰세요'],
  ['竖钩：从红点起笔，顺着虚线写', 'Vertical hook: start at the red dot and follow the dashed line', '縦はね：赤い点から書き始め、破線に沿って', '세로갈고리: 빨간 점에서 시작해 점선을 따라 쓰세요'],
  ['横撇：从红点起笔，顺着虚线写', 'Horizontal then left-falling: start at the red dot and follow the dashed line', '横払い：赤い点から書き始め、破線に沿って', '가로삐침: 빨간 점에서 시작해 점선을 따라 쓰세요'],
  ['捺：从红点起笔，顺着虚线写', 'Right-falling: start at the red dot and follow the dashed line', '右払い：赤い点から書き始め、破線に沿って', '눌림: 빨간 점에서 시작해 점선을 따라 쓰세요'],
  ['竖', 'Vertical stroke', '縦画', '세로획'],
  ['横折', 'Horizontal-turn stroke', '横折れ', '가로꺾임획'],
  ['捺', 'Right-falling stroke', '右払い', '눌림획'],

  // 第六幕 词意
  ['甘泉', 'Sweet Spring', '甘泉', '단 샘물'],
  ['清泉石上流', 'A Clear Spring Flows Over Stones', '清泉石上を流る', '맑은 샘이 돌 위를 흐르다'],
  ['从石头缝里涌出的干净凉水，就叫清泉。', 'Clean cool water gushing from a crack in stone is called a clear spring.', '石の割れ目から湧き出す清らかで冷たい水を、清泉といいます。', '돌 틈에서 솟는 맑고 시원한 물을 맑은 샘, 청천이라 불러요.'],
  ['泉水清凉微甜，古人把最好喝的水叫作甘泉。', 'Spring water is cool and faintly sweet; the ancients called the tastiest water a sweet spring.', '泉水は冷たくほのかに甘く、古人は最もおいしい水を甘泉と呼びました。', '샘물은 시원하고 살짝 달아서, 옛사람들은 가장 맛있는 물을 감천이라 불렀어요.'],
  ['“明月松间照，清泉石上流”——唐代王维写下月夜里泉水漫过石头的声音。', '"Bright moon shines among the pines, a clear spring flows over stones"—Tang poet Wang Wei captured the sound of water crossing stone on a moonlit night.', '「明月松間に照り、清泉石上を流る」——唐の王維が、月夜に泉水が石を越える音を書き留めました。', '"밝은 달은 솔밭 사이로 비치고, 맑은 샘은 돌 위를 흐른다"——당나라 왕유가 달밤에 물이 돌을 넘는 소리를 적었어요.'],

  // 第七幕 余韵
  ['明月松间照，清泉石上流——山睡了，泉还在轻轻地唱。', 'Moonlight among the pines, a clear spring over stones—the hills sleep, but the spring still sings softly.', '明月松間に照り、清泉石上を流る——山は眠り、泉はなおそっと歌っています。', '달빛은 솔밭 사이로, 맑은 샘은 돌 위로——산은 잠들었지만 샘은 아직 조용히 노래해요.'],
  ['点一点水面激起涟漪，点一点松林唤起流萤', 'Tap the water for ripples, tap the pines to wake the fireflies', '水面をタップして波紋を、松林をタップして蛍を呼び起こそう', '수면을 눌러 물결을 만들고, 솔밭을 눌러 반딧불을 깨우세요'],
];

// 笔画进度：第 n 笔，共 9 笔。
const strokeNames = ['撇', '竖', '横折', '横', '横', '竖钩', '横撇', '撇', '捺'];
const enNames = ['Left-falling', 'Vertical', 'Horizontal-turn', 'Horizontal', 'Horizontal', 'Vertical hook', 'Horizontal then left-falling', 'Left-falling', 'Right-falling'];
const jaNames = ['払い', '縦画', '横折れ', '横画', '横画', '縦はね', '横払い', '払い', '右払い'];
const koNames = ['삐침', '세로획', '가로꺾임', '가로획', '가로획', '세로갈고리', '가로삐침', '삐침', '눌림'];
for (let i = 1; i <= 9; i++) {
  rows.push([
    `第 ${i} 笔，共 9 笔。`,
    `Stroke ${i} of 9 · ${enNames[i - 1]}`,
    `全9画中の${i}画目 · ${jaNames[i - 1]}`,
    `9획 중 ${i}번째 획 · ${koNames[i - 1]}`,
  ]);
}

const check = process.argv.includes('--check');
let failed = false;
for (const [index, locale] of ['en', 'ja', 'ko'].entries()) {
  const file = new URL(`../data/adventure/locale/${locale}.txt`, import.meta.url);
  const table = parseLocaleFile(fs.readFileSync(file, 'utf8'));
  const add = [];
  for (const row of rows) {
    if (!row[index + 1]) throw new Error(`Missing ${locale}: ${row[0]}`);
    if (!table[row[0]]) add.push(formatLocaleLine(row[0], row[index + 1]));
  }
  if (check) {
    if (add.length) { failed = true; console.log(`${locale}: ${add.length} missing`); }
    else console.log(`${locale}: complete`);
  } else if (add.length) {
    fs.appendFileSync(file, `\n# 2026-11-13 泉 · 月夜山水独立故事\n${add.join('\n')}\n`);
    console.log(`${locale}: ${add.length} added`);
  } else console.log(`${locale}: nothing to add`);
}
if (failed) process.exit(1);