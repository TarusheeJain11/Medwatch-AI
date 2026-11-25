import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { SkeletonCards } from "./StatusBadge";

export default function ProtectedRoute({ children, roles = [] }) {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="main-container">
                <SkeletonCards count={3} />
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" state={{ from: location.pathname }} replace />;
    }

    if (roles.length > 0 && !roles.includes(user.role)) {
        return (
            <div className="main-container">
                <div className="alert-box error" role="alert">
                    <div>
                        <strong>Access Restricted</strong>
                        <p>Your account role ({user.role === "pharmacy_owner" || user.role === "pharmacy" ? "Pharmacy Owner" : user.role}) does not have permission to open this workspace.</p>
                    </div>
                </div>
            </div>
        );
    }

    return children;
}
