import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";

/**
 * Recorte de la imagen de portada.
 *
 * Adaptado del ImageUploader que paso Axel (del totem de Zuheros): de alli se conserva lo que
 * servia -el recorte con react-easy-crop y el volcado a canvas- y se quita lo que era de aquel
 * proyecto: PocketBase, SweetAlert2, el store del kiosko y `virtual:terminal`, que aqui no existen.
 *
 * La imagen sale como data URL, que es exactamente lo que el asistente ya guarda en
 * `coverImageUrl`. Asi el recorte no cambia nada de como se guarda ni de como se publica: solo se
 * interpone entre elegir el fichero y rellenar ese campo.
 *
 * Por que recortar y no escalar: la portada se pinta con `object-fit: cover`, asi que si la
 * proporcion no coincide el navegador recorta por su cuenta, normalmente por el centro y casi
 * siempre por donde no toca. Recortando aqui, el organizador decide que parte se ve.
 */

/** Proporcion de la portada en entraditas.com. 16:9 es la de las tarjetas y la ficha del evento. */
const PROPORCION_PORTADA = 16 / 9;
/** A cuanto se exporta. Mas de 1600 px de ancho no aporta nada en pantalla y engorda el JSON. */
const ANCHO_EXPORTADO = 1600;

interface AreaRecortada {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Pinta en un canvas solo el trozo elegido y lo devuelve como data URL.
 *
 * JPEG y no PNG a proposito: la portada es una fotografia y en PNG ocupa varias veces mas. Esto
 * viaja dentro del JSON del evento hasta la web, asi que el tamano importa.
 */
export async function recortarAImagen(origen: string, area: AreaRecortada): Promise<string> {
  const imagen = new Image();
  imagen.src = origen;
  await new Promise((listo, fallo) => {
    imagen.onload = listo;
    imagen.onerror = () => fallo(new Error("No se pudo leer la imagen."));
  });

  const escala = Math.min(1, ANCHO_EXPORTADO / area.width);
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(area.width * escala);
  lienzo.height = Math.round(area.height * escala);

  const contexto = lienzo.getContext("2d");
  if (!contexto) throw new Error("Este navegador no puede recortar imagenes.");
  contexto.drawImage(imagen, area.x, area.y, area.width, area.height, 0, 0, lienzo.width, lienzo.height);

  return lienzo.toDataURL("image/jpeg", 0.85);
}

export interface CoverImageCropperProps {
  /** La portada actual, para poder verla y cambiarla. */
  value?: string;
  onChange: (dataUrl: string) => void;
  aspect?: number;
}

export function CoverImageCropper({ value, onChange, aspect = PROPORCION_PORTADA }: CoverImageCropperProps) {
  const [original, setOriginal] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<AreaRecortada | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alTerminarDeRecortar = useCallback((_: unknown, enPixeles: AreaRecortada) => setArea(enPixeles), []);

  function elegirFichero(files: FileList | null) {
    const fichero = files?.[0];
    if (!fichero) return;
    setError(null);
    const lector = new FileReader();
    lector.onload = () => {
      setOriginal(String(lector.result));
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    lector.onerror = () => setError("No se pudo leer el archivo.");
    lector.readAsDataURL(fichero);
  }

  async function aplicar() {
    if (!original || !area) return;
    try {
      onChange(await recortarAImagen(original, area));
      setOriginal(null);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "No se pudo recortar la imagen.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-foreground bg-background p-4 text-center text-sm font-bold">
        {value ? (
          <img src={value} alt="Portada elegida" className="max-h-40 w-full object-contain" />
        ) : (
          <>
            <Icon name="upload" size={22} />
            Adjuntar imagen de portada
          </>
        )}
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => elegirFichero(e.target.files)} />
      </label>
      {value && <p className="text-xs text-muted-foreground">Pulsa la imagen para elegir otra y recortarla.</p>}
      {error && <p role="alert">{error}</p>}

      {original && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Recortar la imagen de portada"
            className="w-full max-w-2xl overflow-hidden rounded-lg border-2 border-foreground bg-surface shadow-flat-lg"
          >
            <div className="flex items-center justify-between border-b-2 border-foreground px-4 py-3">
              <h2 className="text-sm font-extrabold uppercase tracking-wide">Recortar la portada</h2>
              <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => setOriginal(null)}>
                Cancelar
              </Button>
            </div>

            <div className="relative h-80 w-full bg-foreground">
              <Cropper
                image={original}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={alTerminarDeRecortar}
                minZoom={0.5}
                maxZoom={3}
                restrictPosition={false}
              />
            </div>

            <div className="flex flex-col gap-3 p-4">
              <label className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide">
                Zoom
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="w-12 text-right">{Math.round(zoom * 100)}%</span>
              </label>
              <Button type="button" onClick={() => void aplicar()} disabled={!area} className="self-start">
                Recortar y usar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
