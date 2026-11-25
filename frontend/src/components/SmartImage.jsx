import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

export default function SmartImage({
    src,
    fallbackSrc = "/images/meds/tablet.svg",
    alt = "Product image",
    height = 140,
    fit = "cover",
    style = {},
    className = ""
}) {
    const { lowBandwidth } = useAuth();
    const [currentSrc, setCurrentSrc] = useState(src || fallbackSrc);

    useEffect(() => {
        setCurrentSrc(src || fallbackSrc);
    }, [src, fallbackSrc]);

    const effectiveSrc = lowBandwidth && currentSrc.startsWith("http")
        ? fallbackSrc
        : currentSrc;

    return (
        <div
            className={`smart-img-wrap ${className}`}
            style={{
                height,
                borderRadius: 10,
                overflow: "hidden",
                background: "#F4FAFA",
                border: "1px solid var(--mw-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                ...style
            }}
        >
            <img
                src={effectiveSrc}
                alt={alt}
                loading="lazy"
                onError={() => {
                    if (currentSrc !== fallbackSrc) {
                        setCurrentSrc(fallbackSrc);
                    }
                }}
                style={{
                    width: "100%",
                    height: "100%",
                    objectFit: fit,
                    display: "block"
                }}
            />
        </div>
    );
}
