# HABITAT INTEGRAL PH — Sistema de Mantenimientos v2.0

## Uso Local (sin Railway)

1. Instale Node.js desde https://nodejs.org (versión LTS)
2. Abra esta carpeta en una terminal / cmd
3. Ejecute: `npm install`
4. Ejecute: `node server.js`
5. Abra: http://localhost:3000

**Windows:** doble clic en `INICIAR_WINDOWS.bat`
**Mac/Linux:** ejecute `./iniciar_mac_linux.sh`

---

## Deploy en Railway

### Variables de entorno necesarias:

| Variable       | Descripción                          |
|----------------|--------------------------------------|
| `DATABASE_URL` | Railway la agrega automáticamente    |
| `JWT_SECRET`   | Cualquier texto largo y secreto      |

### Pasos:
1. Suba esta carpeta a un repositorio de GitHub
2. En Railway: New Service → GitHub Repo → seleccione el repo
3. En Railway: New → Database → PostgreSQL (agrega DATABASE_URL solo)
4. Agregue la variable `JWT_SECRET` en Variables del servicio
5. Railway despliega automáticamente en 2-3 minutos

---

## Credenciales por defecto
| Usuario                  | Contraseña   | Rol           |
|--------------------------|--------------|---------------|
| admin@habitatph.com      | admin123     | Administrador |
| tecnico@habitatph.com    | tecnico123   | Usuario       |

---

## Estructura del proyecto
```
habitat/
├── server.js                 ← Servidor Node.js + API + PostgreSQL
├── public/
│   ├── index.html            ← Aplicación web completa
│   └── logo.png              ← Logo de la empresa
├── package.json
├── railway.json              ← Config Railway
├── .gitignore
├── INICIAR_WINDOWS.bat       ← Inicio rápido Windows
├── iniciar_mac_linux.sh      ← Inicio rápido Mac/Linux
└── README.md
```

## Funcionalidades v2.0
- ✅ Historial completo por mantenimiento (con fechas y usuario)
- ✅ Archivos PDF/imagen guardados en PostgreSQL (no se pierden)
- ✅ Calendario con fechas DD/MM en lugar de símbolos
- ✅ Botón "Marcar como Realizado" con fecha del día
- ✅ Notificaciones por mes con nombre del edificio
- ✅ Exportar a Excel por edificio
- ✅ 3 documentos adjuntos por mantenimiento
- ✅ Botones de atrás en todas las páginas
- ✅ Acceso multiusuario desde cualquier lugar
