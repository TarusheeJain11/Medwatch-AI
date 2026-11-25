import { Component } from "react";

export class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, message: "" };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, message: error?.message || "Unexpected rendering error." };
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="main-container">
                    <div className="alert-box error" role="alert">
                        <div>
                            <strong>Something went wrong in this screen.</strong>
                            <p style={{ marginTop: 4 }}>{this.state.message}</p>
                        </div>
                        <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => window.location.reload()}
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
