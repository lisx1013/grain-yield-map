/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef } from "react";
import { Map as AMapContainer, APILoader } from "@uiw/react-amap";

// 1. 高德安全密钥
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
  const mapRef = useRef<any>(null);
  const lastRenderRef = useRef<number>(0);

  const [isLoaded, setIsLoaded] = useState(false);

  const computeFeatureBbox = (feature: any) => {
    const coords = feature?.geometry?.coordinates;
    let minLng = 180;
    let minLat = 90;
    let maxLng = -180;
    let maxLat = -90;
    const scan = (arr: any) => {
      for (const item of arr || []) {
        if (Array.isArray(item)) {
          if (typeof item[0] === "number" && typeof item[1] === "number") {
            const lng = item[0];
            const lat = item[1];
            if (lng < minLng) minLng = lng;
            if (lat < minLat) minLat = lat;
            if (lng > maxLng) maxLng = lng;
            if (lat > maxLat) maxLat = lat;
          } else {
            scan(item);
          }
        }
      }
    };
    scan(coords);
    return [minLng, minLat, maxLng, maxLat];
  };

  const bboxIntersects = (bbox: number[], bounds: any) => {
    if (!bbox || !bounds) return false;
    const sw = bounds.getSouthWest ? bounds.getSouthWest() : bounds.southwest;
    const ne = bounds.getNorthEast ? bounds.getNorthEast() : bounds.northeast;
    const minLng = sw.lng;
    const minLat = sw.lat;
    const maxLng = ne.lng;
    const maxLat = ne.lat;
    const [bMinLng, bMinLat, bMaxLng, bMaxLat] = bbox;
    return !(
      bMaxLng < minLng ||
      bMinLng > maxLng ||
      bMaxLat < minLat ||
      bMinLat > maxLat
    );
  };

  // 2. 加载本地数据
  useEffect(() => {
    const loadLocalGeoJSON = async () => {
      try {
        const response = await fetch("/data/convert.json");
        if (!response.ok) throw new Error("文件读取失败");

        const data = await response.json();

        if (data && data.features) {
          for (const f of data.features) {
            if (!f.__bbox) {
              f.__bbox = computeFeatureBbox(f);
            }
          }
          geoDataRef.current = data;
          console.log("数据已就绪，要素数量:", data.features.length);
          setIsLoaded(true);
        }
      } catch (err) {
        console.error("加载数据出错:", err);
      }
    };
    loadLocalGeoJSON();
  }, []);

  const renderGeoLayer = () => {
    const AMap = (window as any).AMap;
    const mapInstance = mapRef.current?.map;
    const data = geoDataRef.current;

    if (!mapInstance || !data || !AMap?.GeoJSON) return;

    const now = Date.now();
    if (now - lastRenderRef.current < 150) return;
    lastRenderRef.current = now;

    const zoom = mapInstance.getZoom();
    if (zoom < 4) {
      mapInstance.clearMap();
      return;
    }

    const bounds = mapInstance.getBounds();
    const featuresInView = data.features.filter((f: any) =>
      bboxIntersects(f.__bbox || computeFeatureBbox(f), bounds)
    );
    const subset = { type: "FeatureCollection", features: featuresInView };

    mapInstance.clearMap();

    try {
      const geojson = new AMap.GeoJSON({
        geoJSON: subset,
        getPolygon: (json: any, lnglats: any) => {
          return new AMap.Polygon({
            path: lnglats,
            fillOpacity: 0.5,
            fillColor: "#40E0D0", // 青色
            strokeColor: "#ffffff",
            strokeWeight: 1,
            bubble: true,
            cursor: "pointer",
            extData: json.properties,
          });
        },
        getMarker: () => new AMap.Marker({ visible: false }),
      });

      geojson.on("click", (e: any) => {
        const props = e.target.getExtData();
        if (props) {
          setSelectedInfo({
            id: props.ID || props.id || "N/A",
            name: props.admin_name || props.name || "行政区域",
            yieldVal: props.yield_val || 0,
          });
          mapInstance.setFitView(e.target);
        }
      });

      mapInstance.add(geojson);
    } catch (e) {
      console.error("渲染GeoJSON图层失败:", e);
    }
  };

  useEffect(() => {
    if (!isLoaded) return;
    const mapInstance = mapRef.current?.map;
    if (!mapInstance) return;
    const handler = () => renderGeoLayer();
    renderGeoLayer();
    mapInstance.on("moveend", handler);
    mapInstance.on("zoomend", handler);
    return () => {
      mapInstance.off("moveend", handler);
      mapInstance.off("zoomend", handler);
    };
  }, [isLoaded]);

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        position: "relative",
        background: "#00050a",
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
        className={`fixed top-0 right-0 w-1/3 h-full transition-transform duration-300 z-1001 p-10 
          ${selectedInfo ? "translate-x-0" : "translate-x-full"} bg-white/90 backdrop-blur-md shadow-2xl`}
      >
        {selectedInfo && (
          <div className="text-slate-900">
            <h2 className="text-3xl font-black">{selectedInfo.name}</h2>
            <div className="mt-10 p-6 bg-blue-50/50 rounded-2xl">
              <p className="text-xs text-blue-500 font-bold uppercase mb-2">
                预测产量
              </p>
              <p className="text-5xl font-black text-blue-600">
                {selectedInfo.yieldVal}
              </p>
            </div>
            <button
              onClick={() => setSelectedInfo(null)}
              className="mt-10 p-2 text-slate-400"
            >
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalMapContainer;
