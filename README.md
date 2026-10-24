# ORBRIVA.IO · MVP multijugador (nombre de trabajo)

Juego web multijugador de arena gravitacional. Código de prueba de concepto para lanzamiento posterior, **no certificado para producción**. El nombre Orbriva.io es una propuesta original. Las búsquedas públicas preliminares no reemplazan la comprobación de marca registrada ni garantizan la disponibilidad del dominio; verificar ambos antes de publicar.

## Arquitectura

```text
Navegador (Canvas 2D, interpolación, 60 FPS)
     | HTTPS / WebSocket WSS
     v
Un Render Web Service (Node.js + ws)
     ├── Archivos estáticos, /health, /config.json, /ads.txt
     ├── Simulación autoritativa: 20 ticks/segundo
     ├── Snapshots cercanos: 8/segundo/cliente
     ├── Gravedad de partículas: cuadrícula espacial
     ├── Bot AI: preferencias, latencia de decisión, reacción y errores
     └── Sala en memoria: humanos reales y bots registrados por separado
```

**Decisiones de eficiencia:** una instancia y sala, sin base de datos, sin Redis, sin motor gráfico y sin empaquetador frontend. Simulación 20 Hz y render 60 Hz; sólo se envían entidades cercanas en snapshots. Los bots aparecen progresivamente hasta completar 16 ocupantes si entra una persona; desaparecen según crece la población real. La simulación permanece inactiva sin humanos. El cliente no envía su posición ni su puntuación. Se limita la entrada a 40 mensajes/segundo por conexión, con `maxPayload` y control del buffer de salida.

**Límites del MVP:** el mundo y los jugadores se guardan en RAM: un reinicio borra la partida. Utilizar **una sola instancia** en Render: dos instancias crearían mundos separados porque Render no garantiza afinidad WebSocket. No se han implementado salas distribuidas, cuentas, moderación avanzada, analítica, protección DDoS de aplicación, historial persistente ni telemetría de rendimiento. Las dimensiones iniciales son 3400 × 3400, 850 partículas, hasta 45 humanos y unos 16 participantes objetivo (humanos + bots). Es imprescindible hacer pruebas de carga antes de afirmar una capacidad productiva.

## Ejecutar localmente

Requisitos: Node.js **20 o superior**, `npm`, acceso al registro npm para instalar `ws`.

```bash
npm install
npm start
```

Abrir <http://localhost:3000>. Para simular dos personas abrir dos ventanas diferentes. Verificar salud en <http://localhost:3000/health>. Las pruebas de la simulación no necesitan conectarse a la red:

```bash
npm test
```

## Publicar en Render.com

1. Crear un repositorio Git con el contenido de esta carpeta (`render.yaml` en la raíz).
2. Conectar GitHub/GitLab en <https://dashboard.render.com/> y elegir **New → Blueprint**; seleccionar ese repositorio.
3. Render leerá `render.yaml` y creará un **Web Service** de Node.js que instalará dependencias y ejecutará `npm start`. El servidor escucha `process.env.PORT` en `0.0.0.0`.
4. Dejar `ADSENSE_CLIENT` vacío mientras no se haya aprobado el sitio. Los valores `MIN_POPULATION` y `MAX_HUMANS` se pueden cambiar desde las variables de entorno.
5. Abrir la URL `https://<servicio>.onrender.com` y comprobar `/health`. Entrar desde dos dispositivos, probar movimiento, crecimiento, consumo, muerte, reinicio y reconexión.
6. **Cambiar `plan: free` a `plan: starter` o el plan de pago vigente** al publicar. En Free Render suspende instancias después de 15 minutos sin solicitudes HTTP ni mensajes WebSocket entrantes, y reactivarlas implica espera. Render puede reiniciar cualquier instancia; el juego reintentará la conexión, pero no conserva el avance anterior.

## Publicidad de Google AdSense H5 Games Ads

La publicidad está **desactivada por defecto**. Este proyecto incorpora un adaptador en `public/ads.js` y un endpoint `/config.json`. Para activarlo legalmente y de forma efectiva:

1. Crear/configurar la cuenta de AdSense; añadir, verificar y obtener aprobación para el dominio del juego; solicitar acceso al programa de **H5 Games Ads** según las condiciones que aplique Google.
2. Añadir en Render la variable de entorno `ADSENSE_CLIENT=ca-pub-1234567890123456` con el ID **real** (16 dígitos) y desplegar. El servidor ofrece `/ads.txt` con la entrada de Google correspondiente.
3. Integrar la política de privacidad definitiva, responsable y contacto, gestión del consentimiento cuando proceda, y las políticas de Google. El aviso `public/privacy.html` actual **es provisional**.
4. Probar con usuarios reales y comprobaciones de Google. El adaptador hace una llamada de oportunidad a `adBreak({type:'next', name:'replay-game', ...})` **sólo en el botón de reintentar después de morir**, y espacia oportunidades un mínimo de 120 segundos por sesión. La API de Google decide si efectivamente se muestra un anuncio; el juego siempre debe funcionar sin anuncios.
5. **Nunca generar impresiones publicitarias falsas, clics automáticos o visitas sintéticas.** Los bots son sólo personajes de simulación, no clientes HTTP ni visitas web, y nunca solicitan anuncios.

Documentación: [Google H5 Games Ads](https://support.google.com/adsense/answer/9959170), [Ad Placement API](https://developers.google.com/ad-placement/docs/example).

## Bots adaptativos y transparencia

- Los bots se muestran con una pequeña etiqueta **IA** en el ranking y encima de su personaje.
- Tienen comportamientos diferentes: agresión, prudencia, búsqueda de comida, retirada ante rivales grandes, inercia de giro, objetivos revisados a intervalos variables y pequeñas imprecisiones.
- No falsifican conexiones, usuarios humanos, sesiones publicitarias ni estadísticas de tráfico.
- Los recuentos de humanos y bots son independientes, también en `/health`.

## Próximos pasos técnicos

1. Benchmark con 20/50 humanos y perfiles CPU, memoria y ancho de banda para determinar límites reales de una instancia.
2. Mejorar el netcode: mensajes binarios / cuantización, *delta snapshots*, extrapolación local, latencia medida.
3. Analítica de retención respetuosa de la privacidad, sistema de partidas/salas independientes y persistencia opcional para rankings.
4. Sharding por sala y servidor, enrutamiento hacia una sala específica y almacenamiento compartido sólo al necesitar varias instancias.
5. Moderación de apodos, observabilidad, límites de conexiones por IP, protección frente a bots hostiles y auditoría de AdSense.

## Estructura

- `server/index.js`: servidor HTTP, WebSocket y límites de entrada.
- `server/world.js`: físicas, IA, PvP, generación y snapshots.
- `public/index.html`: interfaz inicial y UI de partida.
- `public/styles.css`: diseño adaptable para escritorio y móviles.
- `public/client.js`: Canvas, controles, reconexión, HUD y sincronización.
- `public/ads.js`: colocación de anuncios en el reinicio.
- `public/privacy.html`: aviso provisional que debe completarse.
- `tests/world.test.js`: pruebas unitarias del estado de la arena.
