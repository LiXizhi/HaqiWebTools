# AGENTS.md — web/

## 分支与提交约定（用户更新，2026-09-19）

- 本目录是独立的 Git 仓库 `LiXizhi/HaqiWebTools`。
- 默认在 `main` 分支开发和验证，修改完成后保留在本地工作区，不自动执行 `git commit` 或 `git push`。
- 只有用户明确要求提交时才执行 `git commit`；只有用户明确要求推送时才执行 `git push`。提交请求本身不代表授权推送，不必每次修改后询问是否提交。
- 用户要求提交或推送时，默认使用 `main` 和 `origin/main`，除非用户另有明确指示。
- 此约定覆盖父级 `paraworld/AGENTS.md` 中默认提交、推送以及先提交 `dev` 再合并发布分支的要求。
- 各子项目的其他开发与验证规则仍遵循其对应的 `AGENTS.md`。
