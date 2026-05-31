#!/bin/bash
echo ""
echo " ================================================"
echo "  HABITAT INTEGRAL PH - Sistema de Mantenimientos"
echo " ================================================"
echo ""
if ! command -v node &>/dev/null; then
    echo " ERROR: Node.js no instalado. Descargue desde https://nodejs.org"
    exit 1
fi
if [ ! -d "node_modules" ]; then
    echo " Instalando dependencias..."
    npm install
fi
echo " Servidor: http://localhost:3000"
echo " Presione Ctrl+C para detener"
echo ""
node server.js
