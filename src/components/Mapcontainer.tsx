/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef } from "react";
import { Map as AMapContainer, APILoader } from "@uiw/react-amap";

if (typeof window !== "undefined") {
  (window as any)._AMapSecurityConfig = {
    securityJsCode:
      import.meta.env.VITE_AMAP_SECURITY_CODE ||
      "c2cb44bdf8a014380a909e6445befd39",
  };
}

const GlobalMapContainer: React.FC = () => {
  const [selectedInfo, setSelectedInfo] = useState<any>(null);
  const geoDataRef = useRef<any>(null);
  const centersRef = useRef<any>({}); // ✅ 新增：用于存储后端 API 返回的中心点数据
  const mapRef = useRef<any>(null);
  const geojsonLayerRef = useRef<any>(null);
  const lastSelectedPolygon = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // 1. 加载数据：同时加载 GeoJSON 和 行政中心 API
  useEffect(() => {
    const initData = async () => {
      try {
        // 加载地图边界数据
        const geoRes = await fetch("/data/convert.json");
        const geoData = await geoRes.json();

        try {
          const centerRes = await fetch(
            "http://10.0.3.4:5000/api/gpkg/query?file=file1&column=country&value=中国"
          );
          const centerData = await centerRes.json();
          centersRef.current = centerData;
        } catch (e) {
          console.warn("中心点 API 加载失败，将使用前端自动计算兜底", e);
        }

        if (geoData && geoData.features) {
          geoDataRef.current = geoData;
          setIsLoaded(true);
        }
      } catch (err) {
        console.error("初始化失败:", err);
      }
    };
    initData();
  }, []);

  const renderGeoLayer = () => {
    const AMap = (window as any).AMap;
    const mapInstance = mapRef.current?.map;
    if (!mapInstance || !geoDataRef.current || !AMap?.GeoJSON) return;

    if (geojsonLayerRef.current) mapInstance.remove(geojsonLayerRef.current);

    try {
      const geojson = new AMap.GeoJSON({
        geoJSON: geoDataRef.current,
        getPolygon: (json: any, lnglats: any) => {
          return new AMap.Polygon({
            path: lnglats,
            fillOpacity: 0.5,
            fillColor: "#40E0D0",
            strokeColor: "#ffffff",
            strokeWeight: 1,
            bubble: true,
            cursor: "pointer",
            extData: json.properties,
          });
        },
      });

      geojson.on("click", (e: any) => {
        const props = e.target.getExtData();
        const currentPolygon = e.target;

        if (props) {
          // 高亮逻辑
          if (lastSelectedPolygon.current) {
            lastSelectedPolygon.current.setOptions({
              fillColor: "#40E0D0",
              fillOpacity: 0.5,
            });
          }
          currentPolygon.setOptions({ fillColor: "#ffeb3b", fillOpacity: 0.8 });
          lastSelectedPolygon.current = currentPolygon;

          setSelectedInfo({
            id: props.ID || props.id || "N/A",
            name: props.admin_name || props.name || "行政区域",
            yieldVal: props.yield_val || props.yieldVal || 0,
          });

          // ✅ 2. 【核心修改：使用后端 API 的中心点进行定位】
          const adminName = props.admin_name || props.name;
          const apiCenter = centersRef.current[adminName]; // 从 API 数据中匹配

          let finalCenter;
          if (apiCenter && Array.isArray(apiCenter)) {
            // 如果 API 有数据，用 API 的
            finalCenter = new AMap.LngLat(apiCenter[0], apiCenter[1]);
          } else {
            // 如果 API 没数据，用前端计算兜底
            finalCenter = currentPolygon.getBounds().getCenter();
          }

          if (finalCenter) {
            // 放大并移动到该中心
            mapInstance.setZoomAndCenter(8, finalCenter, false, 500);
          }
        }
      });

      geojsonLayerRef.current = geojson;
      mapInstance.add(geojson);
    } catch (e) {
      console.error("渲染失败:", e);
    }
  };

  useEffect(() => {
    if (isLoaded) renderGeoLayer();
  }, [isLoaded]);

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        position: "relative",
        background: "#00050a",
        overflow: "hidden",
      }}
    >
      <APILoader
        akey={import.meta.env.VITE_AMAP_KEY || "你的KEY"}
        plugins={["AMap.GeoJSON"]}
      >
        <AMapContainer
          ref={mapRef}
          style={{ width: "100%", height: "100%" }}
          zooms={[2, 18]}
          center={[105, 36]}
          mapStyle="amap://styles/dark"
        />
      </APILoader>

      {/* 侧边栏 */}
      <div
        style={{
          position: "fixed",
          top: "0",
          right: "0",
          width: "380px",
          height: "100%",
          backgroundColor: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(20px)",
          boxShadow: "-10px 0 30px rgba(0,0,0,0.5)",
          zIndex: 99999,
          transform: selectedInfo ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
          padding: "40px",
          display: "flex",
          flexDirection: "column",
          color: "#0f172a",
        }}
      >
        {selectedInfo && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "40px",
              }}
            >
              <h2 style={{ fontSize: "28px", fontWeight: 900, margin: 0 }}>
                {selectedInfo.name}
              </h2>
              <button
                onClick={() => {
                  setSelectedInfo(null);
                  if (lastSelectedPolygon.current) {
                    lastSelectedPolygon.current.setOptions({
                      fillColor: "#40E0D0",
                      fillOpacity: 0.5,
                    });
                  }
                }}
                style={{
                  border: "none",
                  background: "#f1f5f9",
                  borderRadius: "50%",
                  width: "36px",
                  height: "36px",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                padding: "30px",
                background: "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)",
                borderRadius: "24px",
                color: "#fff",
                marginBottom: "30px",
              }}
            >
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: "bold",
                  opacity: 0.7,
                  marginBottom: "10px",
                }}
              >
                预测产量
              </p>
              <p style={{ fontSize: "56px", fontWeight: 900, margin: 0 }}>
                {selectedInfo.yieldVal}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default GlobalMapContainer;
