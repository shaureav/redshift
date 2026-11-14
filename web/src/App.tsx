import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Loading } from "./components/Common";

const Landing = lazy(() => import("./pages/Landing"));
const TradeMapPage = lazy(() => import("./pages/TradeMapPage"));
const Dossiers = lazy(() => import("./pages/Dossiers"));
const CandidateDossier = lazy(() => import("./pages/CandidateDossier"));
const MaterialDossier = lazy(() => import("./pages/MaterialDossier"));
const Planner = lazy(() => import("./pages/Planner"));
const Investigations = lazy(() => import("./pages/Investigations"));
const Compare = lazy(() => import("./pages/Compare"));
const Evidence = lazy(() => import("./pages/Evidence"));
const Quality = lazy(() => import("./pages/Quality"));
const Methods = lazy(() => import("./pages/Methods"));
const About = lazy(() => import("./pages/About"));

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading what="page" />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Landing />} />
            <Route path="map" element={<TradeMapPage />} />
            <Route path="dossiers" element={<Dossiers />} />
            <Route path="dossiers/candidate/:id" element={<CandidateDossier />} />
            <Route path="dossiers/material/:name" element={<MaterialDossier />} />
            <Route path="planner" element={<Planner />} />
            <Route path="investigations" element={<Investigations />} />
            <Route path="investigations/compare" element={<Compare />} />
            <Route path="evidence" element={<Evidence />} />
            <Route path="quality" element={<Quality />} />
            <Route path="methods" element={<Methods />} />
            <Route path="about" element={<About />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
