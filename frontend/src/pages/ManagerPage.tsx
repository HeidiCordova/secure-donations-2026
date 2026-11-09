import { ErrorMessage } from '../components/ErrorMessage';

export const ManagerPage = () => {
  return (
    <div>
      <h1 className="text-2xl font-bold">Gestión de Campañas</h1>
      <ErrorMessage
        actionLabel="Volver al catálogo"
        actionTo="/"
        description="Por ahora no hay campañas disponibles para gestionar."
        title="No hay campañas para mostrar"
        variant="empty"
      />
    </div>
  );
};
