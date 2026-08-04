# Fontes

`Inter.ttf` (variable, SIL Open Font License — ver `OFL.txt`) é usada para
compor o texto dos criativos em `src/lib/creative.ts`.

Ela fica versionada aqui porque o runtime serverless da Vercel não traz fontes:
sem um arquivo próprio, o fontconfig não acha nenhuma família e o texto sai em
branco. O `next.config.ts` inclui esta pasta no rastreamento da rota
`/api/studio`, e `ensureFonts()` escreve o `fonts.conf` em `/tmp` em runtime,
apontando para cá — o caminho absoluto só é conhecido lá.
