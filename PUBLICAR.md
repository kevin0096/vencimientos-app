# Cómo publicar cambios de la app

La app se publica con **GitHub Pages** desde la carpeta `docs/` de este repositorio:
**https://kevin0096.github.io/vencimientos-app/**

El APK carga esa dirección (`server.url` en `capacitor.config.json`), así que:

1. Editar los archivos de `docs/`.
2. `git add docs && git commit -m "..." && git push`
3. En 1–2 minutos GitHub Pages publica la versión nueva y los celulares la reciben al volver a abrir la app, sin reinstalar.

Solo hay que recompilar e instalar un APK nuevo si cambian plugins, permisos, ícono o `server.url`:

```
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

Historial: hasta el 30-oct-2026 se publicaba en Netlify (controv.netlify.app). Se migró a GitHub Pages porque el plan gratuito de Netlify bloquea los despliegues al agotar sus créditos mensuales.
