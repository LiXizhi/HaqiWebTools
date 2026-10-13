"""Authored Hanzi island content. Does not generate or invent historical glyphs."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# id, glyph, pinyin, meaning, example, spoken word, poem, English poem, action, English action
ROWS = [
('ri','日','rì','sun; day','日出的时候，我们出发。','日出','清晨的一束光，叫醒沉睡的岛。','A ray of morning light wakes the island.','照亮地图上的出发点','light the starting point on the map'),
('yue','月','yuè','moon; month','月亮照着小路。','月亮','把夜空的一点光，带在身边。','Carry a little moonlight with you.','照亮夜晚的小路','light the path at night'),
('shan','山','shān','mountain','山在河的另一边。','大山','把远方的起伏，留在一个字里。','Keep the shape of distant peaks in a character.','让地图上的山峰重新出现','restore the mountains on the map'),
('shui','水','shuǐ','water','我给小树浇水。','河水','流过山谷，也流进我们的文字。','Flow through the valley and into a character.','引水流向干枯的花园','bring water to the dry garden'),
('huo','火','huǒ','fire','小心，火很烫。','火苗','一点光，让黑夜有了温度。','A small flame brings warmth to the night.','点亮村口的灯','light the lamp by the village'),
('mu','木','mù','tree; wood','这里有一块木头。','木头','向下扎根，向上生长。','Roots reach down. Branches reach up.','让一棵小树长出新叶','help a small tree grow new leaves'),
('shi','石','shí','stone','这块石头很圆。','石头','静静的石头，记得水流的声音。','A quiet stone remembers the sound of water.','修好河边的石头路标','repair the stone sign by the river'),
('tu','土','tǔ','soil; earth','种子藏在土里。','泥土','柔软的土地，接住一颗种子。','Soft earth welcomes a seed.','给种子准备柔软的土地','prepare soft soil for a seed'),
('ren','人','rén','person','那个人在等一封信。','人们','有人等你，也有人与你同行。','Someone waits for you. Someone walks beside you.','找到等待来信的人','find the person waiting for a letter'),
('kou','口','kǒu','mouth; opening','请开口说一声你好。','开口','一句问候，让陌生人靠近。','A greeting brings strangers closer.','向门口的居民问路','ask a resident for directions'),
('shou','手','shǒu','hand','我用手拿起信。','小手','伸出手，把帮助送到身边。','Reach out and lend a hand.','接住被风吹起的信','catch a letter carried by the wind'),
('mu-eye','目','mù','eye','请看这个字的笔画。','目光','认真看，线索就在眼前。','Look closely. The clue is right here.','看清信封上的小图案','look at the picture on the envelope'),
('er','耳','ěr','ear','我用耳朵听声音。','耳朵','风里有声音，也有朋友的呼唤。','The breeze carries a friend’s voice.','听见桥另一边的呼唤','hear a voice across the bridge'),
('xin','心','xīn','heart','收到信，她很开心。','开心','小小的心，装得下一个愿望。','A little heart can hold a wish.','读懂收信人的愿望','understand the reader’s wish'),
('men','门','mén','door; gate','请打开这扇门。','开门','推开一扇门，遇见一个故事。','Open a door and find a story.','打开送信路上的院门','open the courtyard gate'),
('tian-field','田','tián','field','爷爷正在田里。','田地','把阳光和雨水，种成明天。','Sun and rain help tomorrow grow.','在田边找到收信的爷爷','find Grandfather by the field'),
('shang','上','shàng','up; above','风筝飞到树上了。','上面','向上看，还有更远的天空。','Look up. The sky goes on.','把风筝送上天空','send a kite into the sky'),
('xia','下','xià','down; below','小船在桥下面。','下面','轻轻落下，回到等你的地方。','Come gently down to a familiar place.','让风筝慢慢落下','bring the kite gently down'),
('da','大','dà','big','这把伞很大。','大小','大一点，可以为朋友遮雨。','A little bigger makes room for a friend.','把雨伞变大','make the umbrella bigger'),
('xiao','小','xiǎo','small','这只船很小。','小船','小小的，也能去很远的地方。','Even something small can travel far.','让小船通过窄窄的水道','help a small boat pass a narrow channel'),
('zhong','中','zhōng','middle; center','我们在桥中间见面。','中间','走到中间，就能看见彼此。','Meet in the middle and see each other.','标出桥中间的见面点','mark the meeting place in the middle of the bridge'),
('tian-sky','天','tiān','sky; day','今天的天很蓝。','天空','抬头，是没有围墙的远方。','Look up at a world without walls.','让天空重新明亮','make the sky bright again'),
('yun','云','yún','cloud','一朵云慢慢飘过。','白云','把远方的水，轻轻带过来。','Carry distant water softly across the sky.','让白云为花园遮住烈日','bring cloud shade to the garden'),
('yu','雨','yǔ','rain','下雨了，我们带着伞。','下雨','一滴一滴，是天空写来的信。','Drop by drop, a letter from the sky.','用一场小雨完成花园的约定','keep a promise to the garden with gentle rain'),
]
COLORS=['#d4a94f','#91afc2','#627f76','#438eaa','#cc7149','#5d9373','#8d877d','#b49764','#a78367','#ba806a','#c99d77','#678a97','#8b849e','#b97676','#96714f','#879657','#7c9fad','#9aa896','#af8659','#729e99','#b7995f','#7aacc0','#a8b8c0','#628eaa']
chapters=[
 {'id':'hz-01','title':{'zh':'山河的名字','en':'Names of the land'},'place':{'zh':'自然山谷','en':'Valley of beginnings'},'npc':{'zh':'向导阿禾','en':'Guide Ahe'},'intro':{'zh':'阿禾的地图褪色了。灯火、水道和路标都在等自己的名字。帮她找回名字，我们就能一起回村。','en':'Ahe’s map has faded. Lamps, streams and signs are waiting for their names. Help her find a way home.'}},
 {'id':'hz-02','title':{'zh':'村庄的来信','en':'A letter for the village'},'place':{'zh':'来信村','en':'Letter village'},'npc':{'zh':'送信人小满','en':'Messenger Xiaoman'},'intro':{'zh':'小满带来一封没有写姓名的信。信上画着一扇门和一片田。谁在等这封信？我们一起去问问。','en':'Xiaoman has a letter with no name. A door and a field are drawn on it. Who is waiting for it? Let’s find out.'}},
 {'id':'hz-03','title':{'zh':'天空的约定','en':'A promise to the sky'},'place':{'zh':'云上书院','en':'Cloud academy'},'npc':{'zh':'守园人云笙','en':'Gardener Yunsheng'},'intro':{'zh':'云笙答应给朋友看开花的花园，可天气太热了。带上风筝、雨伞和小船，帮他完成这个约定。','en':'Yunsheng promised a friend a flowering garden, but it is too hot. Bring a kite, an umbrella and a boat to help.'}},
]
characters=[]
for i,(id,glyph,pinyin,meaning,example,word,poem,enpoem,action,enaction) in enumerate(ROWS):
 chapter=chapters[i//8]
 characters.append({'id':id,'glyph':glyph,'pinyin':pinyin,'meaning':meaning,'example':example,'words':[word], 'color':COLORS[i], 'animation':{'theme':id,'duration':10000,'phases':[0,2500,5000,8000,10000]},'poem':{'zh':poem,'en':enpoem},'source':'https://github.com/skishore/makemeahanzi','reviewStatus':'source-checked; educator-review-pending','history':{'zh':'本卡展示现代规范字形。动画是艺术联想；历史字形与字源解说尚待审校，不作为史实展示。','en':'This card shows a modern glyph. Its animation is artistic imagination. Historical forms and etymology await editorial review.'},'story':[
 {'id':f'D-hanzi-{id}-01','zh':f'{chapter["npc"]["zh"]}：我们需要{action}。先看一看“{glyph}”的魔法，再说出来或写下来。','en':f'{chapter["npc"]["en"]}: We need to {enaction}. Watch the character, then say it or draw it.'},
 {'id':f'D-hanzi-{id}-02','zh':f'刚才的魔法留下了一点光。前面的路也需要你{action}。换一个地方，再试一次。','en':f'Your magic left a little light. Further along the path, we need to {enaction} again. Try it in this new place.'},
 {'id':f'D-hanzi-{id}-03','zh':f'这次，请根据提示{action}。想一想，要唤醒哪个字？需要时可以展开提示。','en':f'Now {enaction} from the clue. Which character will help? You can reveal a hint.'}
 ]})
specs=[('水','shui','#438eaa',['Ice_SingleAttack_Level1'],'水到渠成','条件准备好，事情自然完成。','Things follow when the conditions are ready.'),('火','huo','#cc7149',['Fire_SingleAttack_Level1','Fire_SingleAttack_Level0'],'星火燎原','小小的力量也能逐渐壮大。','A small beginning can grow into something great.'),('木','mu','#5d9373',['Life_SingleHealWithHOT_Level1'],'生生不息','生命不断延续。','Life continues to grow.'),('山','shan','#627f76',['Ice_GlobalShield'],'稳如泰山','像山一样稳固。','As steady as a mountain.'),('日','ri','#d4a94f',['Life_SingleHeal_ForLife_Level2'],'旭日东升','新的一天开始了。','A new day begins.'),('云','yun','#91afc2',['Storm_SingleAttack_Level1','Storm_SingleAttack_Level0'],'云开雾散','困难过去，事情变得清楚。','The clouds clear and things become clear.')]
effects=[]
available=json.loads((ROOT/'data/adventure/spell-effects.json').read_text(encoding='utf-8'))['bases']
for i,(glyph,theme,color,bases,idiom,explanation,en) in enumerate(specs):
 assert all(base in available for base in bases),bases
 effects.append({'id':f'hz-fx-{i+1}','glyph':glyph,'theme':theme,'color':color,'bases':bases,'characters':[r[0] for r in ROWS[i*4:i*4+4]],'idiom':idiom,'explanation':explanation,'en':en,'meaning':next(r[3] for r in ROWS if r[0]==theme)})
history={
 'ri':('《说文解字》的序把“日”和“月”列为象形字的例子。这里是在介绍古书的分类，不是把游戏动画当作古文字复原。','The preface to Shuowen Jiezi uses 日 and 月 as examples of pictographs. This describes the old text’s classification, not a reconstruction of ancient writing.','https://ctext.org/text.pl?if=en&node=41907&show=parallel'),
 'yue':('《说文解字》把“月”归为象形。月亮的意象可以帮助记忆，但本卡的月光动画是现代创作。','Shuowen Jiezi classifies 月 as a pictograph. Moon imagery can help memory; this moonlight animation is modern artwork.','https://ctext.org/dictionary.pl?char=%E6%9C%88&if=gb&remap=gb'),
 'shan':('《说文解字》山部将“山”归为象形。我们借山峰的起伏做动画，帮助观察字形；动画不是出土文字的复制。','Shuowen Jiezi classifies 山 as a pictograph. Our mountain animation invites observation; it is not a copy of an excavated inscription.','https://ctext.org/shuo-wen-jie-zi/shan-bu2/zh'),
 'shui':('《说文解字》用水流并行的形象解释“水”的形体。本卡取水流作艺术联想，不补画未经核实的古文字阶段。','Shuowen Jiezi connects 水 with the image of flowing streams. This animation uses flowing water without inventing unverified ancient forms.','https://ctext.org/dictionary.pl?id=33518&if=gb'),
 'huo':('《说文解字》火部将“火”归为象形。点灯是岛上的魔法故事，并不是关于汉字起源的历史事件。','Shuowen Jiezi classifies 火 as a pictograph. Lighting the village lamp is our fantasy story, not a historical account of the character’s origin.','https://ctext.org/shuo-wen-jie-zi/huo-bu/zh'),
 'mu':('《说文解字》解释“木”时谈到从地面生长。我们的枝叶动画由这一自然意象展开，不代表每一笔都有固定的魔法含义。','Shuowen Jiezi discusses growth from the earth in its entry for 木. Our branches extend this natural image; individual strokes do not have fixed magical meanings.','https://ctext.org/shuo-wen-jie-zi/mu-bu1/ens'),
 'kou':('《说文解字》用人说话、吃东西的器官解释“口”，并归为象形。游戏中的问候故事取自这个日常意义。','Shuowen Jiezi describes 口 as the organ used for speaking and eating and classifies it as a pictograph. Our greeting story uses this everyday meaning.','https://ctext.org/dictionary.pl?char=%E5%8F%A3&if=gb&remap=gb'),
 'shou':('《说文解字》把“手”归为象形。本卡用伸手帮助朋友作记忆情境，不将情境故事说成字源。','Shuowen Jiezi classifies 手 as a pictograph. Reaching out to help a friend is a memory scene, not an etymology.','https://ctext.org/dictionary.pl?char=%E6%89%8B&if=gb&remap=gb'),
 'mu-eye':('《说文解字》目部将“目”归为象形。本卡把它用于观察线索，帮助联系眼睛与观看的意义。','Shuowen Jiezi classifies 目 as a pictograph. Looking for clues connects this card to the eye and seeing.','https://ctext.org/shuo-wen-jie-zi/mu-bu/zhs'),
}
for character in characters:
 if character['id'] in history:
  zh,en,url=history[character['id']];character['history']={'zh':zh,'en':en,'source':url,'reviewStatus':'primary-text-reference-checked','checked':'2026-10-12'}
spell_names={'Ice_SingleAttack_Level1':'Frost burst','Fire_SingleAttack_Level1':'Flame burst','Fire_SingleAttack_Level0':'Fire light','Life_SingleHealWithHOT_Level1':'Endless life','Ice_GlobalShield':'Protective ward','Life_SingleHeal_ForLife_Level2':'Spring renewal','Storm_SingleAttack_Level1':'Lightning strike','Storm_SingleAttack_Level0':'Storm light'}
out={'version':1,'title':{'zh':'字有魔法','en':'Hanzi Magic'},'chapters':chapters,'characters':characters,'effects':effects,'spellNames':spell_names}
(ROOT/'data/adventure/hanzi/content.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Wrote 24 authored character cards, three chapters and six effects.')

