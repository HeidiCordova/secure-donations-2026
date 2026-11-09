import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get(/\/v1\/projects$/, () =>
    HttpResponse.json({
      items: [
        {
          projectId: 'project-1',
          title: 'Biblioteca comunitaria',
          description: 'Libros y espacios de lectura para el barrio.',
          goalAmountCents: 500000,
          confirmedAmountCents: 125000,
          currency: 'PEN',
          status: 'PUBLICADO',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }),
  ),
];
