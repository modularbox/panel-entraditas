import type { Organization } from "@entraditas/types";
import { filasAbanico, filasRectas, type EventoDemo, type RecintoDemo } from "./construir";

/**
 * El catalogo de la demo (tanda 19): "que haya de cada tipo, con varias sesiones y todo, una demo
 * lo mas real posible".
 *
 * Las diez categorias de la web, casi todas con varias funciones, recintos con plano (butacas y
 * zonas de pie) y sin el, un evento con fecha por confirmar, un partido, sesiones agotadas y a punto
 * de agotarse, una sesion ya celebrada, y eventos en cada estado del panel. Las fechas van de
 * octubre de 2026 a junio de 2027; dos eventos del verano ya celebrados dan historia al dashboard.
 *
 * Todo es inventado a proposito: artistas, compañias, recintos y equipos. Las ciudades y las
 * calles son reales para que la direccion y el mapa tengan sentido, pero ningun nombre de sala,
 * artista o club es el de uno que exista: una demo publica no puede anunciar a alguien de verdad.
 */

export const ORGANIZACIONES_DEMO: Organization[] = [
  {
    id: "demo-org-escena",
    name: "Escena Extremadura",
    slug: "escena-extremadura",
    taxId: "B06123456",
    commissionRate: 0.07,
    contactEmail: "escena.extremadura@example.com",
    contactPhone: "+34 924 210 300",
    status: "active"
  },
  {
    id: "demo-org-deporte",
    name: "Deporte Vivo Eventos",
    slug: "deporte-vivo-eventos",
    taxId: "B10234567",
    commissionRate: 0.06,
    contactEmail: "deporte.vivo@example.com",
    contactPhone: "+34 927 410 220",
    status: "active"
  },
  {
    id: "demo-org-mar",
    name: "Mar y Tierra Experiencias",
    slug: "mar-y-tierra-experiencias",
    taxId: "B11345678",
    commissionRate: 0.09,
    contactEmail: "mar.tierra@example.com",
    contactPhone: "+34 956 330 118",
    status: "active"
  }
];

// Los planos de sala comparten forma: escenario arriba, patio en abanico y anfiteatro recto.
const ESCENARIO_ARRIBA = { clave: "escenario", nombre: "Escenario", tipo: "stage" as const, x: 30, y: 3, ancho: 40, alto: 9 };

export const RECINTOS_DEMO: RecintoDemo[] = [
  {
    id: "demo-v-candil",
    organizationId: "org-1",
    nombre: "Sala Candil",
    ciudad: "Madrid",
    provincia: "Madrid",
    direccion: "Calle de la Palma, 34",
    lat: 40.4262,
    lng: -3.7068,
    zonas: [
      { ...ESCENARIO_ARRIBA, y: 4, alto: 10 },
      { clave: "pista", nombre: "Pista", tipo: "standing", x: 10, y: 18, ancho: 80, alto: 42, aforo: 250, tipoEntrada: "pista" },
      { clave: "anfiteatro", nombre: "Anfiteatro", tipo: "numbered", x: 14, y: 66, ancho: 72, alto: 28, filas: filasRectas(5, 16, true), tipoEntrada: "anfiteatro" }
    ]
  },
  {
    id: "demo-v-foro",
    organizationId: "demo-org-escena",
    nombre: "Teatro del Foro",
    ciudad: "Cáceres",
    provincia: "Cáceres",
    direccion: "Calle San Antón, 12",
    lat: 39.4753,
    lng: -6.3724,
    zonas: [
      ESCENARIO_ARRIBA,
      {
        clave: "platea", nombre: "Platea", tipo: "numbered", x: 8, y: 16, ancho: 84, alto: 50,
        filas: filasAbanico(8, 12, 2, true), tipoEntrada: "platea", preferentes: { filas: 3, tipoEntrada: "preferente" }, accesibles: 2
      },
      { clave: "anfiteatro", nombre: "Anfiteatro", tipo: "numbered", x: 14, y: 72, ancho: 72, alto: 24, filas: filasRectas(4, 18, true), tipoEntrada: "anfiteatro" }
    ]
  },
  {
    id: "demo-v-mercurio",
    organizationId: "demo-org-escena",
    nombre: "Teatro Mercurio",
    ciudad: "Badajoz",
    provincia: "Badajoz",
    direccion: "Calle Menacho, 22",
    lat: 38.8779,
    lng: -6.9706,
    zonas: [
      ESCENARIO_ARRIBA,
      {
        clave: "patio", nombre: "Patio de butacas", tipo: "numbered", x: 6, y: 16, ancho: 88, alto: 50,
        filas: filasAbanico(8, 14, 2, true), tipoEntrada: "patio", preferentes: { filas: 3, tipoEntrada: "preferente" }, accesibles: 2
      },
      { clave: "anfiteatro", nombre: "Anfiteatro", tipo: "numbered", x: 12, y: 72, ancho: 76, alto: 24, filas: filasRectas(4, 16, true), tipoEntrada: "anfiteatro" }
    ]
  },
  {
    id: "demo-v-candela",
    organizationId: "org-1",
    nombre: "Café Teatro Candela",
    ciudad: "Badajoz",
    provincia: "Badajoz",
    direccion: "Calle Francisco Pizarro, 7",
    lat: 38.8794,
    lng: -6.9707
  },
  {
    id: "demo-v-guadalquivir",
    organizationId: "org-2",
    nombre: "Auditorio del Guadalquivir",
    ciudad: "Sevilla",
    provincia: "Sevilla",
    direccion: "Paseo de las Delicias, 5",
    lat: 37.3772,
    lng: -5.9869,
    zonas: [
      ESCENARIO_ARRIBA,
      {
        clave: "patio", nombre: "Patio", tipo: "numbered", x: 6, y: 16, ancho: 88, alto: 52,
        filas: filasAbanico(9, 16, 2, true), tipoEntrada: "patio", preferentes: { filas: 3, tipoEntrada: "preferente" }, accesibles: 4
      },
      { clave: "anfiteatro", nombre: "Anfiteatro", tipo: "numbered", x: 10, y: 73, ancho: 80, alto: 24, filas: filasRectas(5, 20, true), tipoEntrada: "anfiteatro" }
    ]
  },
  {
    id: "demo-v-cuentacuentos",
    organizationId: "org-1",
    nombre: "Teatro Cuentacuentos",
    ciudad: "Madrid",
    provincia: "Madrid",
    direccion: "Calle de Toledo, 88",
    lat: 40.4078,
    lng: -3.7102
  },
  {
    id: "demo-v-carpa-luna",
    organizationId: "demo-org-escena",
    nombre: "Carpa Circo Luna · Recinto Ferial",
    ciudad: "Trujillo",
    provincia: "Cáceres",
    direccion: "Avenida de la Coronación, s/n",
    lat: 39.4602,
    lng: -5.882,
    zonas: [
      { clave: "pista", nombre: "Pista central", tipo: "stage", x: 35, y: 4, ancho: 30, alto: 26 },
      { clave: "sillas", nombre: "Sillas de pista", tipo: "numbered", x: 18, y: 34, ancho: 64, alto: 22, filas: filasAbanico(4, 14, 2), tipoEntrada: "silla" },
      { clave: "grada", nombre: "Grada", tipo: "standing", x: 6, y: 62, ancho: 88, alto: 32, aforo: 200, tipoEntrada: "grada" }
    ]
  },
  {
    id: "demo-v-ria",
    organizationId: "org-1",
    nombre: "Cines Ría · Sala 1",
    ciudad: "Bilbao",
    provincia: "Bizkaia",
    direccion: "Calle Ibáñez de Bilbao, 8",
    lat: 43.263,
    lng: -2.935
  },
  {
    id: "demo-v-marina-sur",
    organizationId: "org-2",
    nombre: "Recinto Marina Sur",
    ciudad: "Valencia",
    provincia: "Valencia",
    direccion: "Muelle de la Aduana, s/n",
    lat: 39.459,
    lng: -0.323,
    zonas: [
      { ...ESCENARIO_ARRIBA, x: 25, ancho: 50, alto: 10 },
      { clave: "pista", nombre: "Pista", tipo: "standing", x: 6, y: 18, ancho: 88, alto: 50, aforo: 1500, tipoEntrada: "general" },
      { clave: "vip", nombre: "Terraza VIP", tipo: "standing", x: 28, y: 74, ancho: 44, alto: 20, aforo: 200, tipoEntrada: "vip" }
    ]
  },
  {
    id: "demo-v-atlantico",
    organizationId: "org-2",
    nombre: "Explanada del Vendaval",
    ciudad: "Cádiz",
    provincia: "Cádiz",
    direccion: "Paseo del Vendaval, s/n",
    lat: 36.5271,
    lng: -6.2886
  },
  {
    id: "demo-v-besos",
    organizationId: "demo-org-deporte",
    nombre: "Arena Besòs",
    ciudad: "Barcelona",
    provincia: "Barcelona",
    direccion: "Rambla de Prim, 2",
    lat: 41.4137,
    lng: 2.2155
  },
  {
    id: "demo-v-vettonia",
    organizationId: "demo-org-deporte",
    nombre: "Pabellón Vettonia",
    ciudad: "Plasencia",
    provincia: "Cáceres",
    direccion: "Avenida de España, 20",
    lat: 40.0303,
    lng: -6.088,
    zonas: [
      { clave: "fondo", nombre: "Fondo", tipo: "standing", x: 10, y: 4, ancho: 80, alto: 20, aforo: 300, tipoEntrada: "fondo" },
      { clave: "pista", nombre: "Pista de juego", tipo: "stage", x: 15, y: 28, ancho: 70, alto: 28 },
      { clave: "tribuna", nombre: "Tribuna", tipo: "numbered", x: 10, y: 60, ancho: 80, alto: 32, filas: filasRectas(5, 22, true), tipoEntrada: "tribuna" }
    ]
  },
  {
    id: "demo-v-san-jorge",
    organizationId: "demo-org-escena",
    nombre: "Centro de Innovación San Jorge",
    ciudad: "Cáceres",
    provincia: "Cáceres",
    direccion: "Plaza de San Jorge, 3",
    lat: 39.4744,
    lng: -6.3707
  },
  {
    id: "demo-v-congresos-merida",
    organizationId: "demo-org-escena",
    nombre: "Centro de Congresos del Guadiana",
    ciudad: "Mérida",
    provincia: "Badajoz",
    direccion: "Avenida del Guadiana, s/n",
    lat: 38.9161,
    lng: -6.3437
  },
  {
    id: "demo-v-puerto-cadiz",
    organizationId: "demo-org-mar",
    nombre: "Puerto Deportivo · Pantalán 3",
    ciudad: "Cádiz",
    provincia: "Cádiz",
    direccion: "Muelle de Levante, s/n",
    lat: 36.5337,
    lng: -6.2849
  },
  {
    id: "demo-v-ferial-badajoz",
    organizationId: "demo-org-mar",
    nombre: "Recinto Ferial de Badajoz",
    ciudad: "Badajoz",
    provincia: "Badajoz",
    direccion: "Avenida de Elvas, s/n",
    lat: 38.8829,
    lng: -7.0104
  },
  {
    id: "demo-v-auditorio-ribera",
    organizationId: "org-1",
    nombre: "Auditorio Ribera",
    ciudad: "Madrid",
    provincia: "Madrid",
    direccion: "Paseo de la Castellana, 212",
    lat: 40.4655,
    lng: -3.6892,
    zonas: [
      ESCENARIO_ARRIBA,
      {
        clave: "platea", nombre: "Platea", tipo: "numbered", x: 6, y: 16, ancho: 88, alto: 52,
        filas: filasAbanico(9, 16, 2, true), tipoEntrada: "platea", preferentes: { filas: 3, tipoEntrada: "preferente" }, accesibles: 4
      },
      { clave: "anfiteatro", nombre: "Anfiteatro", tipo: "numbered", x: 10, y: 73, ancho: 80, alto: 24, filas: filasRectas(5, 20, true), tipoEntrada: "anfiteatro" }
    ]
  },
  {
    id: "demo-v-alcazaba",
    organizationId: "demo-org-escena",
    nombre: "Patio de la Alcazaba",
    ciudad: "Mérida",
    provincia: "Badajoz",
    direccion: "Paseo de Roma, s/n",
    lat: 38.9146,
    lng: -6.3478
  },
  {
    id: "demo-v-plaza-plasencia",
    organizationId: "demo-org-deporte",
    nombre: "Plaza Mayor de Plasencia",
    ciudad: "Plasencia",
    provincia: "Cáceres",
    direccion: "Plaza Mayor, s/n",
    lat: 40.0301,
    lng: -6.0886
  },
  {
    id: "demo-v-castillo-trujillo",
    organizationId: "demo-org-escena",
    nombre: "Patio del Castillo",
    ciudad: "Trujillo",
    provincia: "Cáceres",
    direccion: "Calle del Castillo, s/n",
    lat: 39.4577,
    lng: -5.8818
  }
];

/** Reglas de sala con butaca: sin huecos de un asiento y con plazas para movilidad reducida. */
const SALA = { allowIsolatedSeats: false, wheelchairAccessible: true, lowStockThreshold: 20 };

export const EVENTOS_DEMO: EventoDemo[] = [
  // ---------------------------------------------------------------- Conciertos
  {
    id: "demo-los-invisibles",
    organizationId: "org-1",
    recinto: "demo-v-candil",
    slug: "los-invisibles-gira-luz-de-neon-madrid",
    titulo: "Los Invisibles · Gira Luz de Neón",
    categoria: "concierto",
    resumen: "Dos noches en Sala Candil para presentar su tercer disco, con pista de pie y anfiteatro sentado.",
    descripcion:
      "<p>Los Invisibles vuelven a Madrid con <strong>Luz de Neón</strong>, el disco que los ha sacado de las salas pequeñas. Guitarras limpias, sintetizadores de los ochenta y un directo que se ha ganado fama de no dejar a nadie quieto.</p>" +
      "<p>Tocarán el disco nuevo entero y un repaso a los dos anteriores. Abre la noche <strong>Marea Baja</strong>, trío de pop de Vigo.</p>" +
      "<ul><li>Apertura de puertas: 20:30</li><li>Marea Baja: 21:00</li><li>Los Invisibles: 21:45</li></ul>" +
      "<p>Menores de 16 años, acompañados de un adulto. Hay guardarropa en la entrada.</p>",
    portada: "/event-covers/concierto-indie-madrid.webp",
    etiquetas: ["indie", "pop", "directo"],
    destacado: true,
    estado: "published",
    creado: "2026-07-20",
    publicado: "2026-08-03",
    duracion: 150,
    gastos: { tipo: "fixed", valor: 150 },
    cashback: 5,
    reglas: { maxPerOrder: 6, lowStockThreshold: 25 },
    tipos: [
      { clave: "pista", nombre: "Pista · de pie", precio: 2200, color: "#B23A2E" },
      { clave: "anfiteatro", nombre: "Anfiteatro · sentado", precio: 2800, color: "#C9A227" }
    ],
    sesiones: [
      { nombre: "Primera noche", fecha: "2026-10-16", hora: "21:00", puertas: 30, ocupacion: 0.96 },
      { nombre: "Segunda noche", fecha: "2026-10-17", hora: "21:00", puertas: 30, ocupacion: 0.55 }
    ],
    puertas: ["Puerta principal"]
  },
  {
    id: "demo-noche-flamenca",
    organizationId: "demo-org-escena",
    recinto: "demo-v-foro",
    slug: "noche-flamenca-raices-caceres",
    titulo: "Noche Flamenca: Raíces",
    categoria: "concierto",
    resumen: "Ciclo de otoño en el Teatro del Foro: cante, toque y baile, con un artista invitado distinto cada noche.",
    descripcion:
      "<p><strong>Raíces</strong> es el ciclo flamenco de otoño del Teatro del Foro. Cada sábado, la compañía residente —cante, dos guitarras, percusión y baile— recibe a un artista invitado.</p>" +
      "<ul><li>26 de septiembre: Lucía Barroso (baile)</li><li>24 de octubre: Antonio Cortés (guitarra)</li><li>7 de noviembre: Rocío Vargas (cante)</li><li>21 de noviembre: Manuel del Río (cante)</li><li>5 de diciembre: gala de clausura con todos los invitados</li></ul>" +
      "<p>Duración aproximada: 1 hora y 40 minutos, sin descanso. Una vez empezado, no se permite el acceso hasta el primer aplauso.</p>",
    portada: "/event-covers/noche-flamenca-caceres.webp",
    etiquetas: ["flamenco", "guitarra", "baile"],
    estado: "published",
    creado: "2026-07-01",
    publicado: "2026-07-15",
    duracion: 100,
    gastos: { tipo: "percent", valor: 6 },
    reglas: { ...SALA, maxPerOrder: 8 },
    tipos: [
      { clave: "preferente", nombre: "Platea preferente", precio: 3200, color: "#B23A2E" },
      { clave: "platea", nombre: "Platea", precio: 2600, color: "#1B1B1B" },
      { clave: "anfiteatro", nombre: "Anfiteatro", precio: 1800, color: "#4A6C6F" }
    ],
    sesiones: [
      { nombre: "Con Lucía Barroso (baile)", fecha: "2026-09-26", hora: "21:30", estado: "finished", ocupacion: 0.92 },
      { nombre: "Con Antonio Cortés (guitarra)", fecha: "2026-10-24", hora: "21:30", ocupacion: 0.62 },
      { nombre: "Con Rocío Vargas (cante)", fecha: "2026-11-07", hora: "21:30", ocupacion: 0.35 },
      { nombre: "Con Manuel del Río (cante)", fecha: "2026-11-21", hora: "21:30", ocupacion: 0.18 },
      { nombre: "Gala de clausura", fecha: "2026-12-05", hora: "21:00", duracion: 130, ocupacion: 0.1 }
    ],
    descuentos: [{ codigo: "FLAMENCO10", tipo: "percent", valor: 10 }],
    puertas: ["Puerta principal"]
  },
  {
    id: "demo-rock-sinfonico",
    organizationId: "org-1",
    recinto: "demo-v-auditorio-ribera",
    slug: "rock-sinfonico-orquesta-del-tajo-madrid",
    titulo: "Rock Sinfónico · Orquesta del Tajo",
    categoria: "concierto",
    resumen: "Sesenta músicos y una banda de rock para tocar los grandes himnos de los setenta y ochenta.",
    descripcion:
      "<p>La <strong>Orquesta del Tajo</strong> junta a sus sesenta músicos con una banda de rock para un repertorio de himnos de estadio reescritos para orquesta: cuerdas donde había guitarras y un coro de treinta voces en los estribillos.</p>" +
      "<p>Dirige <strong>Irene Salcedo</strong>. Programa de unas dos horas con un descanso de quince minutos.</p>" +
      "<ul><li>Primera parte: baladas y medios tiempos</li><li>Segunda parte: los himnos, con el coro</li></ul>",
    portada: "/category-covers/concierto.jpg",
    etiquetas: ["sinfónico", "rock", "orquesta"],
    estado: "published",
    creado: "2026-08-20",
    publicado: "2026-09-01",
    duracion: 135,
    gastos: { tipo: "percent", valor: 6 },
    reglas: { ...SALA, maxPerOrder: 8 },
    tipos: [
      { clave: "preferente", nombre: "Platea preferente", precio: 4900, color: "#C9A227" },
      { clave: "platea", nombre: "Platea", precio: 3900, color: "#1B1B1B" },
      { clave: "anfiteatro", nombre: "Anfiteatro", precio: 2900, color: "#4A6C6F" }
    ],
    sesiones: [
      { nombre: "Viernes", fecha: "2027-01-22", hora: "20:30", ocupacion: 0.42 },
      { nombre: "Sábado", fecha: "2027-01-23", hora: "20:30", ocupacion: 0.28 }
    ],
    puertas: ["Acceso Castellana"]
  },

  // ---------------------------------------------------------------- Teatro
  {
    id: "demo-romeo-y-julieta",
    organizationId: "demo-org-escena",
    recinto: "demo-v-mercurio",
    slug: "romeo-y-julieta-badajoz",
    titulo: "Romeo y Julieta",
    categoria: "teatro",
    resumen: "La tragedia de Shakespeare en una versión de hora y media, con dos actores y un telón como única escenografía.",
    descripcion:
      "<p>La compañía <strong>Teatro de la Luna Nueva</strong> reduce la tragedia a lo esencial: dos intérpretes, un telón rojo y la palabra de Shakespeare en una traducción nueva, directa y sin atajos.</p>" +
      "<p>Dirección de <strong>Clara Montoya</strong>. Con Javier Arias y Elena Sanz.</p>" +
      "<ul><li>Duración: 1 hora y 30 minutos, sin descanso</li><li>Recomendada a partir de 12 años</li><li>Coloquio con la compañía tras la función del viernes</li></ul>",
    portada: "/event-covers/romeo-julieta-badajoz.webp",
    galeria: ["/category-covers/teatro.jpg"],
    etiquetas: ["clásico", "shakespeare", "drama"],
    destacado: true,
    estado: "published",
    creado: "2026-07-10",
    publicado: "2026-08-17",
    duracion: 90,
    gastos: { tipo: "fixed", valor: 100 },
    reglas: { ...SALA, maxPerOrder: 8, minimumAge: 12 },
    tipos: [
      { clave: "preferente", nombre: "Patio preferente", precio: 3400, color: "#B23A2E" },
      { clave: "patio", nombre: "Patio de butacas", precio: 2800, color: "#1B1B1B" },
      { clave: "anfiteatro", nombre: "Anfiteatro", precio: 2000, color: "#4A6C6F" }
    ],
    sesiones: [
      { nombre: "Preestreno", fecha: "2026-11-12", hora: "20:30", ocupacion: 0.5 },
      { nombre: "Estreno · con coloquio", fecha: "2026-11-13", hora: "20:30", ocupacion: 0.7 },
      { nombre: "Función de tarde", fecha: "2026-11-14", hora: "18:00", ocupacion: 0.45 },
      { nombre: "Función de noche", fecha: "2026-11-14", hora: "21:00", ocupacion: 0.94 },
      { nombre: "Última función", fecha: "2026-11-15", hora: "18:00", ocupacion: 0.4 }
    ],
    descuentos: [{ codigo: "ROMEO10", tipo: "percent", valor: 10, hasta: "2026-10-31" }],
    puertas: ["Puerta principal"],
    invitados: [{ lista: "Prensa", maximo: 20, nombres: ["Lola Sanz", "Iker Prado", "Rocío Castro", "Tomás Gil"] }]
  },
  {
    id: "demo-la-vida-tal-cual",
    organizationId: "org-1",
    recinto: "demo-v-candela",
    slug: "la-vida-tal-cual-dani-rubio-badajoz",
    titulo: "La vida tal cual · Dani Rubio",
    categoria: "teatro",
    resumen: "El monólogo con el que Dani Rubio lleva dos temporadas llenando salas: la familia, el trabajo y la vida en un grupo de WhatsApp.",
    descripcion:
      "<p><strong>Dani Rubio</strong> cuenta lo que nos pasa a todos pero nadie dice en voz alta: la reunión de padres, el jefe que manda audios de cuatro minutos y el cuñado que lo sabe todo.</p>" +
      "<p>Hora y cuarto de monólogo en el Café Teatro Candela, con mesas y servicio de barra.</p>" +
      "<ul><li>Apertura de puertas: 21:15</li><li>La entrada con consumición incluye una bebida</li><li>Espectáculo para mayores de 16 años</li></ul>",
    portada: "/event-covers/monologo-comico-badajoz.webp",
    etiquetas: ["humor", "monólogo", "comedia"],
    estado: "published",
    creado: "2026-08-01",
    publicado: "2026-08-24",
    duracion: 75,
    gastos: { tipo: "fixed", valor: 100 },
    reglas: { maxPerOrder: 6, minimumAge: 16, lowStockThreshold: 15 },
    tipos: [
      { clave: "general", nombre: "Entrada general", precio: 1500, color: "#1B1B1B", cantidad: 80 },
      { clave: "consumicion", nombre: "Entrada con consumición", precio: 1900, color: "#C9A227", cantidad: 40 }
    ],
    sesiones: [
      { nombre: "Viernes", fecha: "2026-10-23", hora: "22:00", puertas: 45, estado: "sold_out", ocupacion: 1 },
      { nombre: "Sábado", fecha: "2026-10-24", hora: "22:00", puertas: 45, ocupacion: 0.8 },
      { nombre: "Viernes", fecha: "2026-10-30", hora: "22:00", puertas: 45, ocupacion: 0.45 },
      { nombre: "Sábado", fecha: "2026-10-31", hora: "22:00", puertas: 45, ocupacion: 0.25 }
    ]
  },

  // ---------------------------------------------------------------- Familiar
  {
    id: "demo-gran-musical-suenos",
    organizationId: "org-2",
    recinto: "demo-v-guadalquivir",
    slug: "el-gran-musical-de-los-suenos-sevilla",
    titulo: "El Gran Musical de los Sueños",
    categoria: "familiar",
    resumen: "El musical de Navidad para toda la familia: veinte artistas en escena, orquesta en directo y una Sevilla de cuento.",
    descripcion:
      "<p>Una noche de Nochebuena, Candela descubre que los sueños de toda la ciudad se han escapado por la ventana. Para recuperarlos tendrá que cruzar una Sevilla mágica, de la Giralda al río, con la ayuda de un farolero y de un gato que habla demasiado.</p>" +
      "<p><strong>Veinte artistas</strong> en escena, <strong>orquesta en directo</strong> y canciones originales.</p>" +
      "<ul><li>Duración: 1 hora y 45 minutos con descanso</li><li>Recomendado a partir de 4 años</li><li>Los menores de 3 años no necesitan entrada si van en brazos</li></ul>" +
      "<p>Con el código <strong>FAMILIA15</strong>, un 15 % de descuento en compras de 4 entradas o más.</p>",
    portada: "/event-covers/musical-familiar-sevilla.webp",
    etiquetas: ["musical", "navidad", "familia"],
    destacado: true,
    estado: "published",
    creado: "2026-07-15",
    publicado: "2026-09-08",
    duracion: 105,
    gastos: { tipo: "percent", valor: 5 },
    cashback: 10,
    reglas: { ...SALA, maxPerOrder: 8 },
    tipos: [
      { clave: "preferente", nombre: "Patio preferente", precio: 3400, color: "#B23A2E" },
      { clave: "patio", nombre: "Patio", precio: 2800, color: "#1B1B1B" },
      { clave: "anfiteatro", nombre: "Anfiteatro", precio: 2000, color: "#4A6C6F" }
    ],
    sesiones: [
      { nombre: "Función de tarde", fecha: "2026-12-19", hora: "18:00", ocupacion: 0.4 },
      { nombre: "Función matinal", fecha: "2026-12-20", hora: "12:00", ocupacion: 0.55 },
      { nombre: "Función de tarde", fecha: "2026-12-20", hora: "18:00", ocupacion: 0.3 },
      { nombre: "Función de tarde", fecha: "2026-12-26", hora: "18:00", ocupacion: 0.35 },
      { nombre: "Función matinal", fecha: "2026-12-27", hora: "12:00", ocupacion: 0.25 },
      { nombre: "Última función", fecha: "2027-01-03", hora: "12:00", ocupacion: 0.12 }
    ],
    descuentos: [{ codigo: "FAMILIA15", tipo: "percent", valor: 15 }],
    puertas: ["Puerta principal", "Acceso de grupos"]
  },
  {
    id: "demo-bruno-el-oso",
    organizationId: "org-1",
    recinto: "demo-v-cuentacuentos",
    slug: "bruno-el-oso-y-la-banda-del-bosque-madrid",
    titulo: "Bruno el Oso y la Banda del Bosque",
    categoria: "familiar",
    resumen: "Concierto teatralizado para los más pequeños: canciones para bailar, cantar y aprender a compartir.",
    descripcion:
      "<p>Bruno el Oso ha perdido su tambor y la Banda del Bosque no puede tocar sin él. Los niños del público serán los encargados de encontrarlo… a base de canciones.</p>" +
      "<ul><li>Para niños de 2 a 8 años</li><li>Duración: 55 minutos</li><li>Butacas sin numerar: se entra por orden de llegada</li><li>Los menores de 2 años entran gratis en brazos</li></ul>",
    portada: "/category-covers/familiar.jpg",
    etiquetas: ["infantil", "música", "familia"],
    estado: "published",
    creado: "2026-08-10",
    publicado: "2026-09-02",
    duracion: 55,
    gastos: { tipo: "none", valor: 0 },
    reglas: { maxPerOrder: 8, allowSeatSelection: false },
    tipos: [
      { clave: "adulto", nombre: "Adulto", precio: 1200, color: "#1B1B1B", cantidad: 90 },
      { clave: "nino", nombre: "Niño (de 2 a 12 años)", precio: 900, color: "#2F7D6D", cantidad: 90 }
    ],
    sesiones: [
      { nombre: "Domingo por la mañana", fecha: "2026-10-18", hora: "12:00", ocupacion: 0.55 },
      { nombre: "Domingo por la mañana", fecha: "2026-10-25", hora: "12:00", ocupacion: 0.4 },
      { nombre: "Domingo por la mañana", fecha: "2026-11-01", hora: "12:00", ocupacion: 0.3 },
      { nombre: "Sábado por la tarde", fecha: "2026-11-07", hora: "17:00", ocupacion: 0.22 },
      { nombre: "Domingo por la mañana", fecha: "2026-11-08", hora: "12:00", ocupacion: 0.15 }
    ]
  },

  // ---------------------------------------------------------------- Circo
  {
    id: "demo-circo-luna",
    organizationId: "demo-org-escena",
    recinto: "demo-v-carpa-luna",
    slug: "circo-luna-trujillo",
    titulo: "Circo Luna",
    categoria: "circo",
    resumen: "Acróbatas, malabares y el trapecio de los hermanos Álvarez bajo la carpa de Circo Luna, cinco funciones en Trujillo.",
    descripcion:
      "<p>El Circo Luna planta su carpa en el Recinto Ferial de Trujillo con su espectáculo nuevo: <strong>trapecio volante</strong>, malabares con fuego, equilibrios, el payaso Chispas y la banda del circo tocando en directo.</p>" +
      "<ul><li>Duración: 1 hora y 50 minutos con descanso</li><li>Sillas de pista numeradas junto a la pista; la grada es de asiento libre</li><li>Sin animales</li></ul>" +
      "<p>Aparcamiento gratuito en el propio recinto.</p>",
    portada: "/event-covers/circo-familiar-trujillo.webp",
    galeria: ["/category-covers/circo.jpg", "/category-covers/familiar.jpg"],
    etiquetas: ["circo", "acrobacias", "familia"],
    destacado: true,
    estado: "published",
    creado: "2026-08-05",
    publicado: "2026-09-10",
    duracion: 110,
    gastos: { tipo: "fixed", valor: 100 },
    reglas: { maxPerOrder: 8, allowIsolatedSeats: true },
    tipos: [
      { clave: "silla", nombre: "Silla de pista", precio: 2200, color: "#B23A2E" },
      { clave: "grada", nombre: "Grada", precio: 1400, color: "#C9A227" }
    ],
    sesiones: [
      { nombre: "Estreno", fecha: "2026-11-27", hora: "19:00", ocupacion: 0.25 },
      { nombre: "Sábado tarde", fecha: "2026-11-28", hora: "17:00", ocupacion: 0.4 },
      { nombre: "Sábado noche", fecha: "2026-11-28", hora: "20:00", ocupacion: 0.55 },
      { nombre: "Domingo mediodía", fecha: "2026-11-29", hora: "12:00", ocupacion: 0.35 },
      { nombre: "Domingo tarde", fecha: "2026-11-29", hora: "17:00", ocupacion: 0.2 }
    ],
    descuentos: [{ codigo: "LUNA3", tipo: "fixed", valor: 300 }],
    puertas: ["Entrada a la carpa"]
  },

  // ---------------------------------------------------------------- Cine
  {
    id: "demo-cine-independiente",
    organizationId: "org-1",
    recinto: "demo-v-ria",
    slug: "semana-de-cine-independiente-bilbao",
    titulo: "Semana de Cine Independiente",
    categoria: "cine",
    resumen: "Seis películas de autor en versión original subtitulada, una por noche, con coloquio en la clausura.",
    descripcion:
      "<p>La <strong>Semana de Cine Independiente</strong> trae a Bilbao seis películas que han pasado por festivales pequeños y apenas llegarán a las salas comerciales. Todas en versión original con subtítulos en castellano.</p>" +
      "<p>El sábado, sesión de cortometrajes y coloquio con sus directoras y directores.</p>" +
      "<ul><li>Butacas sin numerar</li><li>Entrada reducida para estudiantes y mayores de 65 (se pide acreditación en la puerta)</li></ul>",
    portada: "/event-covers/preestreno-cine-bilbao.webp",
    galeria: ["/category-covers/cine.jpg", "/event-covers/estreno-cine-merida.webp"],
    etiquetas: ["cine de autor", "VOSE", "festival"],
    estado: "published",
    creado: "2026-08-25",
    publicado: "2026-09-14",
    duracion: 110,
    gastos: { tipo: "none", valor: 0 },
    reglas: { maxPerOrder: 6, allowSeatSelection: false },
    tipos: [
      { clave: "general", nombre: "General", precio: 700, color: "#1B1B1B", cantidad: 110 },
      { clave: "reducida", nombre: "Reducida (estudiantes y mayores de 65)", precio: 500, color: "#2F7D6D", cantidad: 30 }
    ],
    sesiones: [
      { nombre: "La orilla de los días", fecha: "2026-11-02", hora: "19:30", ocupacion: 0.35 },
      { nombre: "Hierro y sal", fecha: "2026-11-03", hora: "19:30", ocupacion: 0.25 },
      { nombre: "Los que se quedan", fecha: "2026-11-04", hora: "19:30", ocupacion: 0.4 },
      { nombre: "Cartografía de un verano", fecha: "2026-11-05", hora: "19:30", ocupacion: 0.2 },
      { nombre: "El último tranvía", fecha: "2026-11-06", hora: "19:30", ocupacion: 0.3 },
      { nombre: "Clausura: cortometrajes y coloquio", fecha: "2026-11-07", hora: "18:00", duracion: 150, ocupacion: 0.5 }
    ]
  },

  // ---------------------------------------------------------------- Festivales
  {
    id: "demo-ribera-electronica",
    organizationId: "org-2",
    recinto: "demo-v-marina-sur",
    slug: "ribera-electronica-festival-valencia",
    titulo: "Ribera Electrónica",
    categoria: "festival",
    resumen: "Dos días de música electrónica frente al mar, de la puesta de sol a la madrugada.",
    descripcion:
      "<p><strong>Ribera Electrónica</strong> vuelve al Recinto Marina Sur con dos escenarios, catorce artistas y el Mediterráneo de fondo. Las sesiones empiezan con la puesta de sol y terminan a las cuatro de la madrugada.</p>" +
      "<ul><li>Entrada de día: acceso a la pista y a los dos escenarios</li><li>Terraza VIP: zona elevada con barra propia y aseos exclusivos</li><li>Solo mayores de 18 años, con DNI</li><li>Máximo 4 entradas por compra</li></ul>" +
      "<p>Primera ola de entradas con el código <strong>PRIMERAOLA</strong> hasta el 31 de octubre.</p>",
    portada: "/event-covers/festival-electronica-valencia.webp",
    galeria: ["/category-covers/festival.jpg", "/category-covers/concierto.jpg", "/event-covers/concierto-indie-madrid.webp"],
    etiquetas: ["electrónica", "festival", "playa"],
    destacado: true,
    estado: "published",
    creado: "2026-06-15",
    publicado: "2026-08-01",
    duracion: 600,
    gastos: { tipo: "percent", valor: 8 },
    cashback: 5,
    reglas: { maxPerOrder: 4, minimumAge: 18, allowGuestCheckout: false, lowStockThreshold: 50 },
    tipos: [
      { clave: "general", nombre: "Entrada de día", precio: 4500, color: "#B23A2E", maxPorPedido: 4 },
      { clave: "vip", nombre: "Terraza VIP", precio: 8500, color: "#C9A227", maxPorPedido: 4 }
    ],
    sesiones: [
      { nombre: "Día 1 · Viernes", fecha: "2027-05-14", hora: "18:00", puertas: 60, ocupacion: 0.11 },
      { nombre: "Día 2 · Sábado", fecha: "2027-05-15", hora: "17:00", puertas: 60, ocupacion: 0.14 }
    ],
    descuentos: [{ codigo: "PRIMERAOLA", tipo: "percent", valor: 20, hasta: "2026-10-31", usos: 300 }],
    puertas: ["Acceso Marina", "Acceso VIP"],
    invitados: [{ lista: "Artistas y staff", maximo: 120, nombres: ["Nerea Ibarra", "Pau Ferrer", "Sofía Llorens"] }]
  },
  {
    id: "demo-festival-atlantico",
    organizationId: "org-2",
    recinto: "demo-v-atlantico",
    slug: "festival-atlantico-cadiz",
    titulo: "Festival Atlántico",
    categoria: "festival",
    resumen: "Tres días de pop, rock y fusión junto a la playa de Cádiz, con el atardecer atlántico como telón.",
    descripcion:
      "<p>El <strong>Festival Atlántico</strong> celebra su cuarta edición con tres días de conciertos en la Explanada del Vendaval, a un paso de la playa. Pop, rock, rumba y fusión, con un escenario principal y otro para bandas emergentes.</p>" +
      "<ul><li>Entrada de día: acceso general a los dos escenarios</li><li>Día VIP: entrada preferente, zona con sombra y barra propia</li><li>Mayores de 16 años; menores de 18, con autorización firmada</li></ul>",
    portada: "/category-covers/festival.jpg",
    etiquetas: ["pop", "rock", "verano"],
    estado: "published",
    creado: "2026-08-12",
    publicado: "2026-09-15",
    duracion: 420,
    gastos: { tipo: "percent", valor: 7 },
    reglas: { maxPerOrder: 6, minimumAge: 16, lowStockThreshold: 50, allowSeatSelection: false },
    tipos: [
      { clave: "general", nombre: "Entrada de día", precio: 3900, color: "#B23A2E", cantidad: 1200 },
      { clave: "vip", nombre: "Día VIP", precio: 7500, color: "#C9A227", cantidad: 150 }
    ],
    sesiones: [
      { nombre: "Jueves", fecha: "2027-06-10", hora: "19:00", puertas: 60, ocupacion: 0.05 },
      { nombre: "Viernes", fecha: "2027-06-11", hora: "19:00", puertas: 60, ocupacion: 0.08 },
      { nombre: "Sábado", fecha: "2027-06-12", hora: "18:00", puertas: 60, ocupacion: 0.1 }
    ]
  },

  // ---------------------------------------------------------------- Deporte
  {
    id: "demo-final-four-copa-ribera",
    organizationId: "demo-org-deporte",
    recinto: "demo-v-besos",
    slug: "final-a-cuatro-copa-ribera-baloncesto-barcelona",
    titulo: "Final a Cuatro · Copa Ribera de Baloncesto",
    categoria: "deporte",
    resumen: "Los cuatro mejores equipos de la temporada se juegan la Copa Ribera en un fin de semana en el Arena Besòs.",
    descripcion:
      "<p>La <strong>Copa Ribera</strong> se decide en Barcelona: dos semifinales el sábado y la gran final el domingo. Cada entrada es para un partido; se venden por separado.</p>" +
      "<ul><li>Fondo: vista desde detrás de canasta</li><li>Lateral: a lo largo de la pista, la mejor vista del juego</li><li>Pista VIP: a pie de pista, con servicio de catering</li></ul>" +
      "<p>Los emparejamientos de las semifinales se conocerán al terminar la liga regular.</p>",
    portada: "/event-covers/final-copa-baloncesto-barcelona.webp",
    galeria: ["/category-covers/deporte.jpg", "/event-covers/liga-baloncesto-plasencia.webp"],
    etiquetas: ["baloncesto", "copa", "final"],
    estado: "published",
    creado: "2026-08-28",
    publicado: "2026-09-20",
    duracion: 120,
    gastos: { tipo: "fixed", valor: 150 },
    reglas: { maxPerOrder: 6, lowStockThreshold: 30, allowSeatSelection: false },
    tipos: [
      { clave: "fondo", nombre: "Fondo", precio: 2500, color: "#1B1B1B", cantidad: 400 },
      { clave: "lateral", nombre: "Lateral", precio: 4000, color: "#B23A2E", cantidad: 250 },
      { clave: "pista", nombre: "Pista VIP", precio: 9000, color: "#C9A227", cantidad: 40, maxPorPedido: 4 }
    ],
    sesiones: [
      { nombre: "Semifinal 1", fecha: "2027-02-20", hora: "17:00", puertas: 60, ocupacion: 0.12 },
      { nombre: "Semifinal 2", fecha: "2027-02-20", hora: "20:00", puertas: 45, ocupacion: 0.12 },
      { nombre: "Gran final", fecha: "2027-02-21", hora: "18:00", puertas: 60, ocupacion: 0.25 }
    ]
  },
  {
    id: "demo-vettonia-guadiana",
    organizationId: "demo-org-deporte",
    recinto: "demo-v-vettonia",
    slug: "cb-vettonia-plasencia-guadiana-badajoz-basket",
    titulo: "CB Vettonia Plasencia · Guadiana Badajoz Basket",
    categoria: "deporte",
    resumen: "Derbi extremeño de la Liga Oeste en el Pabellón Vettonia: tribuna numerada y fondo de animación.",
    descripcion:
      "<p>Jornada 6 de la <strong>Liga Oeste</strong>: el CB Vettonia Plasencia recibe al Guadiana Badajoz Basket en el derbi que más público mueve de la temporada.</p>" +
      "<ul><li>Tribuna: asiento numerado a lo largo de la pista</li><li>Fondo: grada de pie, zona de animación</li><li>Socios del club: 50 % de descuento con el código SOCIO50 (se pide el carné en la puerta)</li></ul>",
    portada: "/event-covers/liga-baloncesto-plasencia.webp",
    etiquetas: ["baloncesto", "liga", "derbi"],
    estado: "published",
    creado: "2026-09-05",
    publicado: "2026-09-12",
    duracion: 120,
    gastos: { tipo: "none", valor: 0 },
    reglas: { maxPerOrder: 6, allowIsolatedSeats: true },
    tipos: [
      { clave: "tribuna", nombre: "Tribuna", precio: 1200, color: "#B23A2E" },
      { clave: "fondo", nombre: "Fondo de animación", precio: 800, color: "#1B1B1B" }
    ],
    sesiones: [{ nombre: "Jornada 6", fecha: "2026-11-01", hora: "12:30", puertas: 45, ocupacion: 0.45 }],
    descuentos: [{ codigo: "SOCIO50", tipo: "percent", valor: 50 }],
    partido: { competition: "Liga Oeste · Jornada 6", home: "CB Vettonia Plasencia", away: "Guadiana Badajoz Basket" },
    puertas: ["Puerta 1 · Tribuna", "Puerta 2 · Fondo"]
  },

  // ---------------------------------------------------------------- Conferencias
  {
    id: "demo-foro-creadores",
    organizationId: "demo-org-escena",
    recinto: "demo-v-san-jorge",
    slug: "foro-de-creadores-y-tecnologia-caceres",
    titulo: "Foro de Creadores y Tecnología",
    categoria: "conferencia",
    resumen: "Charlas y mesas de trabajo sobre creación digital, inteligencia artificial y emprendimiento. Fecha por confirmar.",
    descripcion:
      "<p>El <strong>Foro de Creadores y Tecnología</strong> reúne en Cáceres a creadores de contenido, desarrolladores y pequeñas empresas para hablar de cómo se trabaja hoy en digital: herramientas, derechos de autor, inteligencia artificial y cómo vivir de lo que uno hace.</p>" +
      "<ul><li>Ponencias por la mañana, mesas de trabajo por la tarde</li><li>Incluye café y comida</li></ul>" +
      "<p>La organización está cerrando la fecha. Activa el aviso y te escribimos en cuanto salga a la venta.</p>",
    portada: "/event-covers/foro-creadores-extremadura.webp",
    etiquetas: ["tecnología", "emprendimiento", "IA"],
    estado: "published",
    creado: "2026-09-01",
    publicado: "2026-09-18",
    duracion: 480,
    gastos: { tipo: "none", valor: 0 },
    reglas: { maxPerOrder: 4 },
    fechaPorConfirmar: true,
    tipos: [
      { clave: "general", nombre: "Pase general", precio: 3000, color: "#1B1B1B", cantidad: 250 },
      { clave: "estudiante", nombre: "Estudiante", precio: 1500, color: "#2F7D6D", cantidad: 80 }
    ],
    sesiones: []
  },
  {
    id: "demo-jornadas-marketing",
    organizationId: "demo-org-escena",
    recinto: "demo-v-congresos-merida",
    slug: "jornadas-de-marketing-digital-merida",
    titulo: "Jornadas de Marketing Digital",
    categoria: "conferencia",
    resumen: "Dos días de ponencias y talleres prácticos sobre redes sociales, publicidad y analítica para pymes.",
    descripcion:
      "<p>Las <strong>Jornadas de Marketing Digital</strong> están pensadas para pymes, comercios y autónomos que quieren vender más por internet sin depender de una agencia.</p>" +
      "<ul><li><strong>Día 1 · Ponencias:</strong> tendencias, casos de éxito de la región y publicidad en redes</li><li><strong>Día 2 · Talleres:</strong> grupos reducidos con ordenador: anuncios, analítica y correo electrónico</li><li>Incluye café, comida y certificado de asistencia</li></ul>" +
      "<p>Asociaciones empresariales: 20 % de descuento con el código ASOCIADOS.</p>",
    portada: "/category-covers/conferencia.jpg",
    etiquetas: ["marketing", "pymes", "formación"],
    estado: "published",
    creado: "2026-09-03",
    publicado: "2026-09-16",
    duracion: 480,
    gastos: { tipo: "percent", valor: 5 },
    reglas: { maxPerOrder: 5, allowSeatSelection: false },
    tipos: [
      { clave: "general", nombre: "Pase de día", precio: 6000, color: "#1B1B1B", cantidad: 180 },
      { clave: "estudiante", nombre: "Estudiante", precio: 3000, color: "#2F7D6D", cantidad: 40 }
    ],
    sesiones: [
      { nombre: "Día 1 · Ponencias", fecha: "2027-03-11", hora: "09:30", puertas: 30, ocupacion: 0.35 },
      { nombre: "Día 2 · Talleres prácticos", fecha: "2027-03-12", hora: "09:30", puertas: 30, ocupacion: 0.3 }
    ],
    descuentos: [{ codigo: "ASOCIADOS", tipo: "percent", valor: 20 }]
  },

  // ---------------------------------------------------------------- Maritimo
  {
    id: "demo-velero-atardecer",
    organizationId: "demo-org-mar",
    recinto: "demo-v-puerto-cadiz",
    slug: "paseo-en-velero-al-atardecer-bahia-de-cadiz",
    titulo: "Paseo en velero al atardecer",
    categoria: "maritimo",
    resumen: "Dos horas navegando por la bahía de Cádiz a la puesta de sol, con copa de bienvenida a bordo.",
    descripcion:
      "<p>Salimos del puerto deportivo en un velero de 18 metros, bordeamos la ciudad por el Campo del Sur y esperamos la puesta de sol frente a la costa, con una <strong>copa de bienvenida</strong> y picoteo a bordo.</p>" +
      "<ul><li>Duración: 2 horas</li><li>Máximo 36 personas por salida</li><li>Punto de encuentro: Pantalán 3, 20 minutos antes de la salida</li><li>Si el tiempo no acompaña, se cambia la fecha o se devuelve el importe</li></ul>",
    portada: "/category-covers/maritimo.jpg",
    etiquetas: ["barco", "atardecer", "experiencia"],
    estado: "published",
    creado: "2026-08-20",
    publicado: "2026-09-04",
    duracion: 120,
    gastos: { tipo: "fixed", valor: 100 },
    reglas: { maxPerOrder: 8, lowStockThreshold: 8, allowSeatSelection: false },
    tipos: [
      { clave: "adulto", nombre: "Adulto", precio: 3500, color: "#0B5D8A", cantidad: 28 },
      { clave: "nino", nombre: "Niño (de 4 a 12 años)", precio: 1800, color: "#2F7D6D", cantidad: 8 }
    ],
    sesiones: [
      { nombre: "Salida al atardecer", fecha: "2026-10-09", hora: "18:30", puertas: 20, ocupacion: 0.9 },
      { nombre: "Salida al atardecer", fecha: "2026-10-10", hora: "18:30", puertas: 20, ocupacion: 0.75 },
      { nombre: "Salida al atardecer", fecha: "2026-10-11", hora: "18:15", puertas: 20, ocupacion: 0.6 },
      { nombre: "Salida al atardecer", fecha: "2026-10-16", hora: "18:15", puertas: 20, ocupacion: 0.7 },
      { nombre: "Salida al atardecer", fecha: "2026-10-17", hora: "18:15", puertas: 20, ocupacion: 0.4 },
      { nombre: "Salida al atardecer", fecha: "2026-10-18", hora: "18:00", puertas: 20, ocupacion: 0.3 },
      { nombre: "Salida al atardecer", fecha: "2026-10-24", hora: "18:00", puertas: 20, ocupacion: 0.2 },
      { nombre: "Salida al atardecer", fecha: "2026-10-31", hora: "17:00", puertas: 20, ocupacion: 0.1 }
    ]
  },

  // ---------------------------------------------------------------- Ocio
  {
    id: "demo-navidad-magica",
    organizationId: "demo-org-mar",
    recinto: "demo-v-ferial-badajoz",
    slug: "navidad-magica-recinto-ferial-badajoz",
    titulo: "Navidad Mágica",
    categoria: "ocio",
    resumen: "Parque de atracciones de invierno con noria, pista de hielo y mercadillo, por pases de tres horas.",
    descripcion:
      "<p><strong>Navidad Mágica</strong> convierte el Recinto Ferial en un parque de invierno: noria iluminada, pista de hielo, tiovivo, sillas voladoras y un mercadillo navideño con puestos de artesanía y comida.</p>" +
      "<ul><li>Cada pase dura tres horas</li><li>Entrada: acceso al recinto, al mercadillo y a dos atracciones</li><li>Entrada con pulsera: atracciones ilimitadas durante el pase</li><li>Menores de 3 años, gratis</li></ul>",
    portada: "/category-covers/ocio.jpg",
    etiquetas: ["navidad", "atracciones", "familia"],
    estado: "published",
    creado: "2026-08-30",
    publicado: "2026-09-21",
    duracion: 180,
    gastos: { tipo: "fixed", valor: 50 },
    reglas: { maxPerOrder: 10, allowSeatSelection: false, lowStockThreshold: 15 },
    tipos: [
      { clave: "entrada", nombre: "Entrada", precio: 800, color: "#C2580F", cantidad: 120 },
      { clave: "pulsera", nombre: "Entrada con pulsera ilimitada", precio: 2200, color: "#B23A2E", cantidad: 60 }
    ],
    sesiones: [
      { nombre: "Pase de tarde", fecha: "2026-12-05", hora: "17:00", ocupacion: 0.35 },
      { nombre: "Pase de noche", fecha: "2026-12-05", hora: "20:00", ocupacion: 0.25 },
      { nombre: "Pase de mañana", fecha: "2026-12-06", hora: "11:00", ocupacion: 0.2 },
      { nombre: "Pase de tarde", fecha: "2026-12-06", hora: "17:00", ocupacion: 0.3 },
      { nombre: "Pase de tarde", fecha: "2026-12-12", hora: "17:00", ocupacion: 0.2 },
      { nombre: "Pase de noche", fecha: "2026-12-12", hora: "20:00", ocupacion: 0.15 },
      { nombre: "Pase de tarde", fecha: "2026-12-13", hora: "17:00", ocupacion: 0.15 },
      { nombre: "Pase de tarde", fecha: "2026-12-19", hora: "17:00", ocupacion: 0.1 },
      { nombre: "Pase de noche", fecha: "2026-12-19", hora: "20:00", ocupacion: 0.08 },
      { nombre: "Pase de tarde", fecha: "2026-12-26", hora: "17:00", ocupacion: 0.05 }
    ]
  },

  // ---------------------------------------------------------------- Ya celebrados (verano 2026)
  {
    id: "demo-cine-bajo-las-estrellas",
    organizationId: "demo-org-escena",
    recinto: "demo-v-alcazaba",
    slug: "cine-bajo-las-estrellas-merida",
    titulo: "Cine bajo las estrellas",
    categoria: "cine",
    resumen: "Cine de verano al aire libre en el Patio de la Alcazaba: cuatro viernes de agosto.",
    descripcion:
      "<p>Cuatro viernes de agosto de cine al aire libre, con sillas de playa, palomitas y la muralla de fondo. Proyección con presentación a cargo del cineclub de Mérida.</p>",
    portada: "/event-covers/estreno-cine-merida.webp",
    etiquetas: ["cine de verano", "aire libre"],
    estado: "finished",
    creado: "2026-06-10",
    publicado: "2026-06-25",
    duracion: 120,
    gastos: { tipo: "none", valor: 0 },
    reglas: { maxPerOrder: 6, allowSeatSelection: false },
    tipos: [{ clave: "general", nombre: "Entrada", precio: 600, color: "#1B1B1B", cantidad: 120 }],
    sesiones: [
      { nombre: "El faro del sur", fecha: "2026-08-07", hora: "22:00", estado: "finished", ocupacion: 0.85 },
      { nombre: "Tres días en Lisboa", fecha: "2026-08-14", hora: "22:00", estado: "finished", ocupacion: 0.9 },
      { nombre: "Verano del noventa y cuatro", fecha: "2026-08-21", hora: "22:00", estado: "finished", ocupacion: 0.7 },
      { nombre: "La luz de agosto", fecha: "2026-08-28", hora: "22:00", estado: "finished", ocupacion: 0.95 }
    ]
  },
  {
    id: "demo-torneo-3x3",
    organizationId: "demo-org-deporte",
    recinto: "demo-v-plaza-plasencia",
    slug: "torneo-3x3-de-verano-plasencia",
    titulo: "Torneo 3x3 de Verano",
    categoria: "deporte",
    resumen: "Baloncesto 3x3 en la Plaza Mayor: fase de grupos el sábado y finales el domingo.",
    descripcion: "<p>Treinta y dos equipos, una pista en la Plaza Mayor y dos días de baloncesto 3x3 con concurso de triples y de mates.</p>",
    portada: "/category-covers/deporte.jpg",
    etiquetas: ["baloncesto", "3x3", "verano"],
    estado: "finished",
    creado: "2026-06-20",
    publicado: "2026-07-01",
    duracion: 300,
    gastos: { tipo: "none", valor: 0 },
    reglas: { maxPerOrder: 6, allowSeatSelection: false },
    tipos: [{ clave: "general", nombre: "Entrada de grada", precio: 500, color: "#1B1B1B", cantidad: 200 }],
    sesiones: [
      { nombre: "Fase de grupos", fecha: "2026-08-22", hora: "18:00", estado: "finished", ocupacion: 0.6 },
      { nombre: "Finales", fecha: "2026-08-23", hora: "11:00", estado: "finished", ocupacion: 0.75 }
    ]
  },

  // ---------------------------------------------------------------- Sin publicar: cada estado del panel
  {
    id: "demo-don-juan-tenorio",
    organizationId: "demo-org-escena",
    recinto: "demo-v-mercurio",
    slug: "don-juan-tenorio-badajoz",
    titulo: "Don Juan Tenorio",
    categoria: "teatro",
    resumen: "El Tenorio de Zorrilla en su cita de cada otoño, alrededor del Día de Todos los Santos.",
    descripcion:
      "<p>La tradición de cada noviembre: el <strong>Don Juan Tenorio</strong> de José Zorrilla, en verso y con vestuario de época, a cargo de la compañía del Teatro Mercurio.</p>",
    portada: "/category-covers/teatro.jpg",
    etiquetas: ["clásico", "verso", "tradición"],
    estado: "in_review",
    creado: "2026-09-18",
    duracion: 140,
    gastos: { tipo: "fixed", valor: 100 },
    reglas: { ...SALA, maxPerOrder: 8 },
    tipos: [
      { clave: "preferente", nombre: "Patio preferente", precio: 2600, color: "#B23A2E" },
      { clave: "patio", nombre: "Patio de butacas", precio: 2200, color: "#1B1B1B" },
      { clave: "anfiteatro", nombre: "Anfiteatro", precio: 1600, color: "#4A6C6F" }
    ],
    sesiones: [
      { nombre: "Viernes", fecha: "2026-10-30", hora: "20:30", ocupacion: 0 },
      { nombre: "Sábado", fecha: "2026-10-31", hora: "20:30", ocupacion: 0 },
      { nombre: "Día de Todos los Santos", fecha: "2026-11-01", hora: "19:00", ocupacion: 0 }
    ]
  },
  {
    id: "demo-gala-fin-de-ano",
    organizationId: "org-1",
    recinto: "demo-v-auditorio-ribera",
    slug: "gala-de-fin-de-ano-madrid",
    titulo: "Gala de Fin de Año",
    categoria: "concierto",
    resumen: "Concierto, cena y campanadas. Borrador: falta cerrar precios y tipos de entrada.",
    descripcion: "<p>Borrador. Programa por cerrar con la orquesta.</p>",
    etiquetas: ["nochevieja"],
    estado: "draft",
    creado: "2026-09-24",
    duracion: 240,
    gastos: { tipo: "none", valor: 0 },
    tipos: [],
    sesiones: [{ nombre: "Nochevieja", fecha: "2026-12-31", hora: "21:30", ocupacion: 0 }]
  },
  {
    id: "demo-fiesta-espuma",
    organizationId: "demo-org-mar",
    recinto: "demo-v-ferial-badajoz",
    slug: "fiesta-de-la-espuma-badajoz",
    titulo: "Fiesta de la Espuma XXL",
    categoria: "ocio",
    resumen: "Rechazado en revisión: faltaba el plan de seguridad y el seguro de responsabilidad civil.",
    descripcion: "<p>Fiesta de la espuma con DJ al aire libre.</p>",
    etiquetas: ["fiesta"],
    estado: "rejected",
    creado: "2026-09-10",
    duracion: 240,
    gastos: { tipo: "fixed", valor: 100 },
    tipos: [{ clave: "general", nombre: "Entrada", precio: 1000, color: "#1B1B1B", cantidad: 500 }],
    sesiones: [{ nombre: "Noche de verano", fecha: "2027-07-17", hora: "22:00", ocupacion: 0 }]
  },
  {
    id: "demo-acustico-castillo",
    organizationId: "demo-org-escena",
    recinto: "demo-v-castillo-trujillo",
    slug: "acustico-en-el-castillo-trujillo",
    titulo: "Acústico en el Castillo",
    categoria: "concierto",
    resumen: "Cancelado por las obras de restauración del patio del castillo.",
    descripcion: "<p>Concierto acústico en el patio del castillo. Cancelado por las obras de restauración.</p>",
    etiquetas: ["acústico"],
    estado: "cancelled",
    creado: "2026-08-01",
    publicado: "2026-08-15",
    duracion: 90,
    gastos: { tipo: "none", valor: 0 },
    tipos: [{ clave: "general", nombre: "Entrada", precio: 1800, color: "#1B1B1B", cantidad: 150 }],
    sesiones: [{ nombre: "Única", fecha: "2026-10-10", hora: "21:00", ocupacion: 0 }]
  }
];
