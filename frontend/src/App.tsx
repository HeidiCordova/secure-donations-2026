import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { CatalogPage } from './pages/CatalogPage';
import { DetailPage } from './pages/DetailPage';
import { DonatePage } from './pages/DonatePage';
import { HistoryPage } from './pages/HistoryPage';
import { ManagerPage } from './pages/ManagerPage';

export function App() {
  return (
    <BrowserRouter>
      <header className="bg-slate-900 text-white p-4 flex justify-between items-center">
        <span className="font-bold">AQP-SOLIDARIA</span>
        <nav className="flex gap-4">
          <Link to="/" className="hover:underline">Catálogo</Link>
          <Link to="/donar" className="hover:underline">Donar</Link>
          <Link to="/historial" className="hover:underline">Mi Historial</Link>
          <Link to="/gestor" className="hover:underline">Gestor</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<CatalogPage />} />
          <Route path="/proyecto/:id" element={<DetailPage />} />
          <Route path="/donar" element={<DonatePage />} />
          <Route path="/historial" element={<HistoryPage />} />
          <Route path="/gestor" element={<ManagerPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;