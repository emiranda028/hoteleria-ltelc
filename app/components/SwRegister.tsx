"use client";

import { useEffect } from "react";

/** Registra el service worker que habilita "instalar" la app en el celular. */
export default function SwRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // si falla, la app sigue funcionando normal por navegador
      });
    }
  }, []);
  return null;
}
