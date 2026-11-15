import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { RouteBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import { Loading } from "./components/Common";

// One main flow: the plane (/) with its live panel, then compare (/compare) and the cited brief (/brief).
// Everything else is reference material reached from the Reference menu or the command palette.
const Home = lazy(() => import("./pages/Home"));
const AtmosphereCompare = lazy(() => import("./pages/AtmosphereCompare"));
const Brief = lazy(() => import("./pages/Brief"));
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
const Verify = lazy(() => import("./pages/Verify"));
const Request = lazy(() => import("./pages/Request"));

// Old links to /map keep working: the plane is now the home page, and its query string is kept.
function MapRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/${search}`} replace />;
}

// Every route draws inside RouteBoundary (components/ErrorBoundary.tsx): a screen that throws shows the error
// screen, never a blank page, and Back or a link to another page clears it.
export function App() {
  return (
    <BrowserRouter>
      <RouteBoundary>
        <Suspense fallback={<Loading what="page" />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="map" element={<MapRedirect />} />
              <Route path="compare" element={<AtmosphereCompare />} />
              <Route path="brief" element={<Brief />} />
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
              <Route path="verify" element={<Verify />} />
              <Route path="request" element={<Request />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </RouteBoundary>
    </BrowserRouter>
  );
}
