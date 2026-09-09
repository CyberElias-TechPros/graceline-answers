import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles.css';
import Layout from './Layout.jsx';
import AdminLayout from './components/AdminLayout.jsx';
import Home from './pages/Home.jsx';
import Ask from './pages/Ask.jsx';
import Thread from './pages/Thread.jsx';
import Archive from './pages/Archive.jsx';
import ArchiveItem from './pages/ArchiveItem.jsx';
import Prayer from './pages/Prayer.jsx';
import AdminLogin from './pages/AdminLogin.jsx';
import AdminInbox from './pages/AdminInbox.jsx';
import AdminThread from './pages/AdminThread.jsx';
import AdminTeam from './pages/AdminTeam.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/ask" element={<Ask />} />
          <Route path="/t/:token" element={<Thread />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/archive/:id" element={<ArchiveItem />} />
          <Route path="/prayer" element={<Prayer />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/inbox" replace />} />
            <Route path="inbox" element={<AdminInbox />} />
            <Route path="q/:id" element={<AdminThread />} />
            <Route path="team" element={<AdminTeam />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
