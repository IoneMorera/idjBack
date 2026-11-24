let counter = 0;
const id = () => `fx-${(counter += 1)}`;

function block(type, fields) {
  return {
    id: id(),
    type,
    anchor: '',
    menuLabel: '',
    label: '',
    title: '',
    highlight: '',
    subtitle: '',
    body: '',
    image: '',
    alt: '',
    url: '',
    buttonLabel: '',
    email: '',
    size: 'grande',
    pieces: [],
    items: [],
    ...fields,
  };
}

function item(fields) {
  return { id: id(), badge: '', icon: 'star', title: '', price: '', text: '', image: '', media: 'image', ...fields };
}

function paragraph(text) {
  return { id: id(), kind: 'parrafo', intro: '', text, outro: '' };
}

function media(src, alt) {
  return item({ image: src, title: alt, media: src.endsWith('.mp4') ? 'video' : 'image' });
}

const INSCRIPTION_LINES = [
  'Te enviaremos un número de cuenta para realizar el pago según el tipo de inscripción',
  'La plaza quedará confirmada una vez recibido el pago',
  'Los datos recogidos son exclusivamente para uso interno y gestión del evento. En ningún caso se compartirá el listado de asistentes.',
  'Tras la inscripción, podrás optar a entrar en un grupo de WhatsApp con otros asistentes.',
].join('\n');

function contactBlock() {
  return block('contacto', {
    anchor: 'mail',
    menuLabel: 'Contacto',
    body: 'Si tienes alguna duda o sugerencia, puedes ponerte en contacto con nosotros, a traves del correo electronico:',
    email: 'ludovyp@gmail.com',
  });
}

function homeBlocks() {
  const ludovyp = [
    ['/ludovyp-anteriores/LudoVyp2026.mp4', 'LudoVyP - vídeo'],
    ...Array.from({ length: 12 }, (_, index) => [`/ludovyp-anteriores/Ludovyp${index + 1}.jpeg`, `LudoVyP - foto ${index + 1}`]),
    ['/ludovyp-anteriores/Ludovyp_video1.mp4', 'LudoVyP - vídeo 1'],
    ['/ludovyp-anteriores/Ludovyp_video2.mp4', 'LudoVyP - vídeo 2'],
  ];
  const jueganzo = [
    ...Array.from({ length: 7 }, (_, index) => [`/jueganzos-anteriores/Jueganzo_Foto${index + 1}.jpeg`, `Jueganzo - foto ${index + 1}`]),
    ...Array.from({ length: 3 }, (_, index) => [`/jueganzos-anteriores/Jueganzo_Video${index + 1}.mp4`, `Jueganzo - vídeo ${index + 1}`]),
  ];
  return [
    block('galeria', {
      anchor: 'ludovyp-anteriores',
      label: 'Eventos Anteriores',
      title: 'LudoVyP 2026',
      items: ludovyp.map(([src, alt]) => media(src, alt)),
    }),
    block('galeria', {
      anchor: 'jueganzos-anteriores',
      label: 'Eventos Anteriores',
      title: 'Jueganzo',
      items: jueganzo.map(([src, alt]) => media(src, alt)),
    }),
    block('cartel', {
      anchor: 'proximamente',
      label: 'Siguiente evento',
      title: 'Próximamente',
      image: '/proximamente/ludovyp-abril-2027.png',
      alt: 'Próximo evento - LudoVyP 15-18 Abril 2027',
      url: '/ludovyp/abril-2027',
    }),
    block('textoImagen', {
      anchor: 'team',
      imageEffect: 'gris',
      title: '¿Quiénes Somos?',
      body: [
        '¿Conoces al equipo que hay detrás de Ludo VyP?',
        '¡Somos Pilar y Víctor! Las personas que están detrás de esta aventura lúdica.',
        'Nos apasiona el mundo de los juegos de mesa y, sobre todo, crear momentos y encuentros donde compartir esta afición con otros jugones.',
        'A lo largo de los años hemos organizado eventos como Finde Naranja, Intercambio de Jugones y Jueganzo, además de colaborar y participar en otros encuentros como Game On, Edge Days, Ludomanía y muchos más.',
        'Detrás de cada evento hay muchas horas de trabajo, ilusión y ganas de seguir haciendo crecer esta comunidad.',
        '¡Encantados de que nos acompañéis en esta aventura!',
        '¡Nos vemos en las mesas!',
      ].join('\n'),
      image: '/PiyVic.jpg',
      alt: 'Pilar y Víctor, organizadores de Ludo VyP',
    }),
  ];
}

function ludovypBlocks() {
  return [
    block('banner', { image: '/banner.jpg', alt: 'Banner del evento', size: 'grande' }),
    block('texto', {
      anchor: 'fechalugar',
      menuLabel: 'Fecha y lugar',
      title: 'Convivencias lúdicas de juegos de mesa',
      highlight: 'Ludo VyP',
      pieces: [
        paragraph('Ludo VyP es un evento de juegos de mesa de 4 días, pensado para disfrutar del juego libre, conocer gente con la misma afición y compartir un ambiente cercano, divertido y saludable.'),
        paragraph('Se trata de unas convivencias lúdicas en las que decenas de personas se reúnen para jugar sin horarios cerrados ni actividades obligatorias: tú eliges qué juegas, cuándo y con quién.'),
        paragraph('Del jueves 23 de abril de 2026 a las 17:00 al domingo 26 de abril de 2026 a las 16:00'),
        paragraph('Hotel Los Olivos – Getafe (Madrid)'),
      ],
    }),
    block('video', {
      anchor: 'asilopasamos',
      menuLabel: 'Así lo pasamos',
      title: 'Así lo pasamos',
      url: '/videos/LudoVyp2026.mp4',
    }),
    block('iconos', {
      anchor: 'alojamiento',
      menuLabel: 'Alojamiento',
      label: 'Alojamiento',
      title: 'Hotel Los Olivos – Getafe (Madrid)',
      subtitle: 'Recomendamos alojarse en el Hotel Los Olivos, sede del evento, por comodidad y ventajas económicas.',
      items: [
        item({ icon: 'tag', text: 'Precio especial para asistentes a Ludo VyP' }),
        item({ icon: 'badgeCheck', text: 'Comidas y cenas incluidas para una comodidad total durante las convivencias' }),
        item({ icon: 'goal', text: 'Descuento en el precio del evento' }),
      ],
    }),
    block('precios', {
      anchor: 'precio',
      menuLabel: 'Precio',
      label: 'Precios del hotel',
      title: 'Importante:',
      body: [
        'El alojamiento se gestiona directamente con el hotel. Tras la inscripción al evento te facilitaremos el correo de contacto',
        'Precio por habitación doble. Suplemento para habitación individual (29.50€ por noche)',
        'El precio incluye comidas y cenas independientemente de si te alojas en el hotel o no.',
      ].join('\n'),
      items: [
        item({ title: 'Jueves a Domingo', price: '240 €', text: 'Evento: 60€ + Alojamiento: 180€. Precio por persona. Pensión Completa' }),
        item({ title: 'Viernes a Domingo', price: '200 €', text: 'Evento: 80€ + Alojamiento: 120€. Precio por persona. Pensión Completa' }),
        item({ title: 'Jueves a Domingo SIN ALOJAMIENTO', price: '200 €', text: 'SIN ALOJAMIENTO. Precio por persona. Incluye comidas y cenas' }),
        item({ title: 'Viernes a Domingo SIN ALOJAMIENTO', price: '195 €', text: 'SIN ALOJAMIENTO. Precio por persona. Incluye comidas y cenas' }),
        item({ title: 'Pase de día (Valido para Viernes o Sábado)', price: '100 €', text: 'SIN ALOJAMIENTO. Precio por persona. Incluye comidas y cenas' }),
      ],
    }),
    block('inscripcion', {
      anchor: 'contact',
      menuLabel: 'Inscripción',
      image: '/formulario.jpg',
      alt: 'Formulario de inscripción',
      buttonLabel: 'Rellena este formulario de inscripción',
      url: 'https://docs.google.com/forms/d/e/1FAIpQLSdzY3IHE2EUMNxhUZoQ0qQXcLEJnsVSPafpfi5wzJQ3VOpfnw/viewform',
      body: INSCRIPTION_LINES,
    }),
    block('alternados', {
      anchor: 'features',
      menuLabel: 'Cambios y Cancelaciones',
      label: 'Cambios y Cancelaciones',
      title: 'Cambios y Cancelaciones',
      items: [
        item({
          badge: 'Cambio de nombre',
          title: 'Cambio de nombre',
          text: 'Se puede cambiar el nombre de la inscripción hasta el 19 de abril de 2026. En caso de cambio de nombre, se devolverá el 100 % del importe. Según el tiempo de aviso, puede que no sea posible adaptar los menús por alergias',
          image: '/roboto.png',
        }),
        item({
          badge: 'Cancelaciones',
          title: 'Cancelación antes del 2 de Marzo de 2026',
          text: 'Devolución del importe menos 10 €. Si se cubre la plaza, se devolverá el 100 %.',
          image: '/gamestation.png',
        }),
        item({
          badge: 'Cancelaciones',
          title: 'Cancelación entre el 2 de Marzo y el 5 de Abril de 2026',
          text: 'Devolución del importe menos 30 €. Si se cubre la plaza, se devolverá el 100 %.',
          image: '/pacheco.png',
        }),
        item({
          badge: 'Cancelaciones',
          title: 'Cancelación después del 5 de Abril de 2026',
          text: 'No se realizará devolución. Si se cubre la plaza, se devolverá el 100 %.',
          image: '/runner.png',
        }),
      ],
    }),
    block('faq', {
      anchor: 'faq',
      menuLabel: 'FAQ',
      label: 'FAQS',
      title: 'Preguntas Frecuentes',
      items: [
        item({
          title: '¿Qué es Ludo VyP?',
          text: 'Ludo VyP nace de la ilusión de dos apasionados de los juegos de mesa, con experiencia organizando eventos para grupos jugones, que querían dar un paso más y crear un encuentro más largo y completo. Nuestro objetivo es sencillo: jugar mucho, conocer gente y pasarlo genial.',
        }),
        item({
          title: '¿Qué puedes esperar del evento?',
          text: 'Buen ambiente y convivencia entre personas con la misma afición, juego libre durante todo el evento, gran variedad de juegos (Eurogames, Ameritrash, Party games, Novedades y clásicos), un salón de juego disponible las 24 horas, tiempo para jugar, charlar y desconectar.',
        }),
        item({
          title: '¿Que tipo de evento es?',
          text: 'Ludo VyP es un evento de juego libre. Los juegos son aportados por los propios asistentes, lo que permite una gran variedad y descubrir títulos nuevos gracias a otros jugadores.',
        }),
        item({
          title: '¿Las comidas están incluidas?',
          text: 'La inscripción incluye todas las comidas, desde la cena del jueves hasta la comida del domingo, incluso aunque no te alojes en el hotel. No tendrás que preocuparte por nada durante el evento.',
        }),
        item({
          title: '¿Vienes solo/a?',
          text: 'Si no te importa compartir habitación, avísanos y trataremos de ponerte en contacto con otra persona interesada.',
        }),
        item({
          title: '¿No necesitas alojamiento?',
          text: 'No hay problema. Disponemos de pases para asistentes sin alojamiento.',
        }),
      ],
    }),
    contactBlock(),
    block('alternados', {
      anchor: 'patrocinadores',
      menuLabel: 'Patrocinadores',
      label: 'Patrocinadores',
      title: 'Patrocinadores',
      items: [
        item({
          badge: 'GDM',
          title: 'GDM',
          text: 'GDM siempre se ha caracterizado por su fuerte apuesta por el talento nacional, tanto en la autoría como en la Ilustración, contando con más de 100 juegos en catálogo y un palmarés de premios internacionales donde destacan un Golden Geek y una nominación al Spiel des Jahres',
          image: '/gdm.png',
        }),
      ],
    }),
  ];
}

function jueganzoBlocks() {
  return [
    block('banner', {
      image: '/fotosJueganzoSep2026/JueganzoSep2026.jpeg',
      alt: 'Jueganzo - Septiembre 2026',
      size: 'mediano',
    }),
    block('texto', {
      anchor: 'fechalugar',
      menuLabel: 'Fecha y Lugar',
      title: 'Disfruta de un día de Juegos',
      highlight: 'Jueganzo Septiembre 2026',
      pieces: [
        paragraph('Jueganzo es un evento de un solo día pensado para disfrutar al máximo de los juegos de mesa. Prepárate para una jornada intensiva donde lo importante es desconectar, compartir y jugar sin parar.'),
        {
          id: id(),
          kind: 'lista',
          intro: '¿Qué encontrarás?',
          text: [
            'Un día completo rodeado de juegos de mesa',
            'Buen ambiente y muchas risas',
            'Picoteo y bebidas incluidas',
            'La oportunidad de probar juegos nuevos y muchas novedades',
          ].join('\n'),
          outro: 'Tanto si eres un jugón habitual como si quieres descubrir este mundillo, este evento es para ti.',
        },
        paragraph('El Sábado 5 de Septiembre de 10:00 a 23:00'),
        paragraph('En Alcalá de Henares'),
      ],
    }),
    block('precios', {
      anchor: 'precio',
      menuLabel: 'Precio',
      label: 'Precio del evento',
      title: 'Importante:',
      body: [
        'El evento se tiene que pagar por adelantado. Tras la inscripción al mismo te facilitaremos la forma de pago a traves del correo',
        'Precio por persona 22€',
        'Se incluye el picoteo y bebidas.',
        'La comida y la cena se puede pedir y pagar junto al evento (Tiene coste adicional)',
      ].join('\n'),
    }),
    block('inscripcion', {
      anchor: 'contact',
      menuLabel: 'Inscripción',
      image: '/formulario.jpg',
      alt: 'Formulario de inscripción',
      buttonLabel: 'Rellena este formulario de inscripción',
      url: 'https://docs.google.com/forms/d/e/1FAIpQLSdV_QNl1G_b_Swt5IXKqryeVw2AIbkFRFlvuSLiOXykYvMaOA/viewform',
      body: INSCRIPTION_LINES,
    }),
    contactBlock(),
  ];
}

const FIXED_PAGES = [
  { route_path: '/', slug: 'inicio', title: 'Página principal', build: homeBlocks },
  { route_path: '/ludovyp/2026', slug: 'ludovyp-2026', title: 'LudoVyp 2026', build: ludovypBlocks },
  { route_path: '/jueganzo/septiembre-2026', slug: 'jueganzo-septiembre-2026', title: 'Jueganzo septiembre 2026', build: jueganzoBlocks },
];

module.exports = { FIXED_PAGES };
