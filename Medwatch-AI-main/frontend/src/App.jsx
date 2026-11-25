import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";

import Home from "./pages/Home.jsx";
import Catalog from "./pages/Catalog.jsx";
import Directory from "./pages/Directory.jsx";
import DemoOrders from "./pages/DemoOrders.jsx";
import HelpAndAi from "./pages/HelpAndAi.jsx";
import StatusPage from "./pages/StatusPage.jsx";
import Account from "./pages/Account.jsx";
import PartnerDashboard from "./pages/PartnerDashboard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import VerifyEmail from "./pages/VerifyEmail.jsx";
import AdminLogin from "./pages/AdminLogin.jsx";

function App() {
    return (
        <ErrorBoundary>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/admin/login" element={<AdminLogin />} />

                <Route
                    path="/"
                    element={
                        <Layout>
                            <Home />
                        </Layout>
                    }
                />
                <Route
                    path="/catalog"
                    element={
                        <Layout>
                            <Catalog />
                        </Layout>
                    }
                />
                <Route
                    path="/directory"
                    element={
                        <Layout>
                            <Directory />
                        </Layout>
                    }
                />
                <Route
                    path="/orders"
                    element={
                        <Layout>
                            <DemoOrders />
                        </Layout>
                    }
                />
                <Route
                    path="/orders/:id"
                    element={
                        <Layout>
                            <DemoOrders />
                        </Layout>
                    }
                />
                <Route
                    path="/help"
                    element={
                        <Layout>
                            <HelpAndAi />
                        </Layout>
                    }
                />
                <Route
                    path="/status"
                    element={
                        <Layout>
                            <StatusPage />
                        </Layout>
                    }
                />

                <Route
                    path="/account"
                    element={
                        <Layout>
                            <ProtectedRoute>
                                <Account />
                            </ProtectedRoute>
                        </Layout>
                    }
                />
                <Route
                    path="/pharmacy/dashboard"
                    element={
                        <Layout>
                            <ProtectedRoute roles={["pharmacy_owner", "pharmacy"]}>
                                <PartnerDashboard />
                            </ProtectedRoute>
                        </Layout>
                    }
                />
                <Route
                    path="/admin/dashboard"
                    element={
                        <Layout>
                            <ProtectedRoute roles={["admin"]}>
                                <AdminDashboard />
                            </ProtectedRoute>
                        </Layout>
                    }
                />

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </ErrorBoundary>
    );
}

export default App;
