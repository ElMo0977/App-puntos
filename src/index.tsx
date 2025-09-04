import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Punto de entrada de la aplicación
const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error("No se encontró el nodo 'root' en el DOM.");
  throw new Error("Root element not found");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
