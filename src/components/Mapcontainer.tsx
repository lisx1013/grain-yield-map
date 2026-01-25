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

  const [isLoaded, setIsLoaded] = useState(false);

  // 2. 加载本地数据
  useEffect(() => {
    const loadLocalGeoJSON = async () => {
      try {
        const response = await fetch("/data/convert.json");
        if (!response.ok) throw new Error("文件读取失败");

        const data = await response.json();

        if (data && data.features) {
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

    mapInstance.clearMap();

    try {
      const geojson = new AMap.GeoJSON({
        geoJSON: data,
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
      mapInstance.setFitView();
    } catch (e) {
      console.error("渲染GeoJSON图层失败:", e);
    }
  };

  // 当数据加载标记改变或地图组件渲染时尝试绘图
  useEffect(() => {
    if (isLoaded) {
      const timer = setTimeout(renderGeoLayer, 500);
      return () => clearTimeout(timer);
    }
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
