import { ErrorMessage } from '../components/ErrorMessage';

export const DonatePage = () => {
  return (
    <div>
      <h1 className="text-2xl font-bold">Realizar Donación Simulada</h1>
      <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded mt-2">
        Simulación académica: no se ha realizado ningún cobro
      </p>
      <ErrorMessage
        actionLabel="Explorar proyectos"
        actionTo="/"
        description="Elige un proyecto del catálogo para continuar con una donación simulada."
        title="Primero elige un proyecto"
        variant="empty"
      />
    </div>
  );
};
