# 魔法哈奇品牌图标

2026-09-26：采用无文字、紫色巫师帽与精灵尖耳主角头像。图片由内置 imagegen 生成；按用户要求改为尖耳后作为本轮图标源。仅素材发布到 CDN，未发布游戏或商店页面。

- 无损母版：`art-references/magic-haqi-logo-elf.webp`，保留透明通道。
- 资源清单：`art-references/magic-haqi-logo.json`，记录原PNG哈希、母版哈希、尺寸、各输出哈希及实测CDN地址。
- 通用透明WebP：`assets/branding/magic-haqi-elf-{32,48,64,128,192,256,512,1024}.webp`，每张不超过200,000字节，先无损再按需有损压缩。
- 桌面：`shell/electron/icons/magic-haqi.ico`（16/24/32/48/64/128/256），PNG与ICNS为1024母尺寸。electron-builder与窗口图标已接入；下次桌面/Steam内容构建生效。
- Android：五档mipmap普通/圆形/自适应前景已替换，自适应前景放入108dp图层的66dp圆形安全区，底色为浅紫。AndroidManifest与adaptive XML仍引用既有资源名。
- 商店格式为原生要求的例外：PNG、ICO、ICNS、JPG留在shell/或android/，不进入H5 dist。网页美术副本仍使用WebP。

## Steam与Android商店

`shell/branding/steam-app-184.jpg`对应[Steam社区应用图标](https://partner.steamgames.com/doc/store/assets/community)184×184 JPG；快捷方式使用ICO，Mac使用ICNS。Steamworks后台需由有该应用权限的人上传并发布，修改安装包图标不会自动更新商店图标。本轮未操作Steamworks。

`shell/branding/android-store-512.png`供Android商店资料上传，启动图标来自Android工程mipmap。本轮未提交商店审核或签名发布。

## 重建与核验

```sh
python scripts/prepare_brand_icons.py
python scripts/publish_brand_icons.py --verify
```

修改母版时使用`prepare_brand_icons.py --source <已批准PNG>`；清单仅复用哈希未变化的CDN核验记录。首次上传用`publish_brand_icons.py --uploader <现有qiniu_upload_local_files.py>`。只上传清单中明确标记的13张独立素材，成功后逐项GET核对SHA-256与CORS，不触发应用发布或Git镜像复制。

尺寸与圆形裁切预览：`.asset-cache/brand-icons-preview.png`。

## 已批准的游戏启动画面（2026-09-26）

用户先审阅横屏、竖屏两张预览并明确批准后，替换Android原有11张Capacitor占位`splash.png`。横屏与竖屏各自使用对应母版，按目标宽高比居中裁切，不拉伸；主角尖耳和帽子完整保留。

- 母版：`art-references/magic-haqi-splash-landscape.webp`、`magic-haqi-splash-portrait.webp`，无损归档。
- 清单：`art-references/magic-haqi-splash.json`，记录原PNG与母版哈希、输出尺寸、SHA-256和已核验CDN地址。
- Android：drawable默认480×320；land五档480×320、800×480、1280×720、1600×960、1920×1280；port为对应竖屏尺寸。
- 两张CDN WebP均不超过200,000字节，保留PNG作为Android原生资源；未修改应用主题、未加入人为等待或进度条。
- 本轮检查文件尺寸、解码、裁切、哈希和Android资源编译；未在真机上验证各Android版本的启动过渡，未生成或发布签名APK。

```sh
python scripts/prepare_brand_splash.py
python scripts/publish_brand_icons.py --kind splash --verify
```

首轮导入使用`--landscape <已批准PNG> --portrait <已批准PNG>`。本机裁切预览位于`.asset-cache/brand-splash-preview.png`。上传沿用同一品牌上传脚本并指定`--kind splash --uploader <现有上传器>`；不会重传图标或发布游戏本体。

## iOS与macOS（2026-09-26）

- iOS `AppIcon.appiconset/AppIcon-512@2x.png` 替换为1024×1024 RGB不透明浅紫底精灵标志，沿用工程的通用AppIcon目录。
- `Splash.imageset` 原三张Capacitor占位图替换为已批准横版的中心方形裁切，供默认/iPad布局；另提供各1x/2x/3x横版与竖版。文件名保留旧名以保持目录引用，实际像素以清单为准。
- 使用Apple图片集的width-class/height-class：compact宽+regular高用竖版，compact高用横版，其余用方形。LaunchScreen使用scaleAspectFit及深紫底，非标准宽高比保留边带，避免切掉角色和帽子。尺寸类别不是精确方向检测，iPad分屏由系统类别选择。
- macOS安装包沿用`magic-haqi.icns`（包含32至1024像素表示）；开发及打包运行时在macOS显式设置Dock图标，Windows/Linux窗口图标仍使用原配置。
- `python scripts/prepare_apple_branding.py`重建iOS资源、`art-references/magic-haqi-apple.json`哈希清单与`.asset-cache/apple-branding-preview.png`。使用已批准母版，无新增AI美术或CDN重复上传。
- 已核验10张iOS图片的格式/哈希、catalog引用与槽位唯一性、storyboard/plist、8个ICNS表示以及Electron语法。Windows不能完成Xcode资源编译、iOS/macOS签名构建及真机验收，本轮未宣称这些通过。

图片集字段依据：[Apple Image Set Type](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/ImageSetType.html)。
