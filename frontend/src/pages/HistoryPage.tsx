import { ErrorMessage } from '../components/ErrorMessage';

export const HistoryPage = () => {
  return (
    <div>
      <h1 className="text-2xl font-bold">Mi Historial de Donaciones</h1>
      <ErrorMessage
        actionLabel="Explorar proyectos"
        actionTo="/"
        description="Cuando realices una donación simulada, aparecerá aquí para que puedas consultarla."
        title="Aún no tienes donaciones"
        variant="empty"
      />
    </div>
  );
};
