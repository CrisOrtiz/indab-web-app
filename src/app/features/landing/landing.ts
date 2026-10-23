import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

interface Item {
  title: string;
  text: string;
}

interface Faq {
  question: string;
  answer: string;
}

// Public landing page. Draft: the copy below is placeholder content for Cris to review.
@Component({
  selector: 'app-landing',
  imports: [RouterLink],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class Landing {
  protected readonly auth = inject(AuthService);

  protected readonly sections = [
    { id: 'nosotros', label: 'Nosotros' },
    { id: 'programas', label: 'Programas' },
    { id: 'metodologia', label: 'Metodología' },
    { id: 'plataforma', label: 'Plataforma' },
    { id: 'eleva', label: 'Eleva Inversiones' },
    { id: 'preguntas', label: 'Preguntas' },
    { id: 'contacto', label: 'Contacto' },
  ];

  protected readonly pillars: Item[] = [
    {
      title: 'Conocimiento',
      text: 'Bases sólidas de mercados, análisis técnico y fundamental, explicadas paso a paso.',
    },
    {
      title: 'Disciplina',
      text: 'Rutinas, diario de trading y reglas claras para operar con constancia.',
    },
    {
      title: 'Estrategia',
      text: 'Planes de trading probados, con entradas, salidas y gestión del riesgo definidas.',
    },
    {
      title: 'Resultados',
      text: 'Medimos tu progreso con métricas reales para que mejores operación tras operación.',
    },
  ];

  protected readonly stats = [
    { value: '+500', label: 'Estudiantes' },
    { value: '+40', label: 'Clases grabadas' },
    { value: '24/7', label: 'Acceso al material' },
  ];

  protected readonly programs: (Item & { level: string })[] = [
    {
      level: 'Nivel 1',
      title: 'Fundamentos del trading',
      text: 'Qué es un mercado, tipos de activos, velas japonesas, soportes, resistencias y tendencias.',
    },
    {
      level: 'Nivel 2',
      title: 'Análisis técnico avanzado',
      text: 'Estructura de mercado, zonas de liquidez, indicadores y confluencias para tus entradas.',
    },
    {
      level: 'Nivel 3',
      title: 'Gestión de riesgo y capital',
      text: 'Tamaño de posición, ratio riesgo/beneficio, drawdown y cómo proteger tu cuenta.',
    },
    {
      level: 'Nivel 4',
      title: 'Psicología del trader',
      text: 'Control emocional, sesgos, rutinas y el diario de trading como herramienta de mejora.',
    },
  ];

  protected readonly steps: Item[] = [
    { title: 'Aprende', text: 'Clases en vivo y grabadas, con material descargable por módulo.' },
    { title: 'Practica', text: 'Repite el mercado vela a vela y entrena sin arriesgar tu dinero.' },
    { title: 'Opera', text: 'Aplica tu plan con mentoría y revisión de tus operaciones.' },
    { title: 'Mejora', text: 'Analiza tus métricas y ajusta tu estrategia con la comunidad.' },
  ];

  protected readonly features: (Item & { soon?: boolean })[] = [
    {
      title: 'Cursos y lecciones',
      text: 'Todo el contenido organizado por niveles, a tu ritmo y desde cualquier dispositivo.',
    },
    {
      title: 'Material de estudio',
      text: 'Repositorio de guías, PDFs, plantillas y videos para estudiantes inscritos.',
    },
    {
      title: 'Práctica con repetición de gráficos',
      text: 'Vuelve a reproducir el mercado vela a vela, toma decisiones y mide tus resultados.',
      soon: true,
    },
    {
      title: 'Comunidad y mentoría',
      text: 'Sesiones de análisis en vivo y acompañamiento de nuestros mentores.',
    },
  ];

  protected readonly testimonials = [
    {
      quote: 'Testimonio de ejemplo: aquí irá la experiencia real de un estudiante de INDAB.',
      name: 'Nombre del estudiante',
      role: 'Estudiante, Nivel 2',
    },
    {
      quote: 'Testimonio de ejemplo: qué aprendió, cómo cambió su forma de operar.',
      name: 'Nombre del estudiante',
      role: 'Estudiante, Nivel 3',
    },
    {
      quote: 'Testimonio de ejemplo: opinión sobre la mentoría y la comunidad.',
      name: 'Nombre del estudiante',
      role: 'Egresado',
    },
  ];

  protected readonly faqs: Faq[] = [
    {
      question: '¿Necesito experiencia previa?',
      answer: 'No. El Nivel 1 parte desde cero y te lleva paso a paso hasta operar con un plan.',
    },
    {
      question: '¿Cómo accedo al material?',
      answer:
        'Crea tu cuenta y, cuando tu inscripción esté confirmada, se habilita tu acceso a la academia y al material de estudio.',
    },
    {
      question: '¿Las clases quedan grabadas?',
      answer:
        'Sí. Las clases en vivo se publican en la plataforma para que las veas cuando quieras.',
    },
    {
      question: '¿Cuánto capital necesito para empezar?',
      answer:
        'Puedes aprender y practicar sin capital. Recomendamos operar con dinero real solo cuando tengas un plan probado.',
    },
    {
      question: '¿Qué es Eleva Inversiones?',
      answer:
        'Es el brazo de inversión de INDAB. Gestiona capital de inversionistas en los mercados. Toda inversión tiene riesgo; conoce los detalles en su página.',
    },
  ];

  protected readonly year = new Date().getFullYear();
}
