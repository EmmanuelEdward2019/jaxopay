import { Navigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { Loader2 } from 'lucide-react';

const FeatureGuard = ({ feature, children }) => {
    const { isFeatureEnabled, isLoading } = useAppStore();

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
        );
    }

    if (!isFeatureEnabled(feature)) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};

export default FeatureGuard;
