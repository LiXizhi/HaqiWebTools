// Fast battle gate: Node only. No browser, CDN, build, player storage or publishing.
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const families=/^(battle_|combat_|arena_|red_mushroom|engine\.|formulas\.|dispel\.|stance_sibling|adventure\.|actor_animation|actor_speech|card_(description|frames|renderer)|spell_(sound|effects|environment|choreography|subject_position|particle_layers)|overhead_status|status_tooltip|pet_status|pet_mount|mount_(pose|rider_scale)|game_sound|monster_capture|adventure_(hand|cast_feedback|card_failure|runes|decks|bags|pet_cards|pets|pet_integration|mounts|stamina|dungeons|island_encounters|reward_persistence|social))/;
const encounterFamilies=/^(encounter_cooldown|dungeon_journeys|adventure_dungeon_)/;
const files=readdirSync(new URL('../tests/',import.meta.url)).filter(name=>name.endsWith('.test.mjs')&&(families.test(name)||encounterFamilies.test(name))).sort().map(name=>'tests/'+name);
if(files.length<30)throw Error('战斗测试发现异常，拒绝静默跳过。');
console.log(`战斗快速回归：${files.length} 个测试文件（仅 Node，无浏览器/构建）`);
const run=spawnSync(process.execPath,['--test',...files],{cwd:root,stdio:'inherit'});
if(run.error)throw run.error;process.exitCode=run.status??1;
