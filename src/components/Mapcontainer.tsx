/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState } from "react";
import { Map as AMapContainer, APILoader } from "@uiw/react-amap";
import type { FeatureCollection } from "geojson";

/* =========================
   本地产量兜底数据（明天交差用）
   ========================= */
const LOCAL_YIELD_MAP: Record<string, number> = {
  Henan: 6500,
  Shandong: 6200,
  Heilongjiang: 7500,
  Sichuan: 4800,
  Anhui: 4100,
  Hunan: 4300,
  Hubei: 3900,
  Jiangsu: 4500,
  Hebei: 3600,
  Guangdong: 2900,
  DEFAULT: 4000,
};

if (typeof window !== "undefined") {
  (window as any)._AMapSecurityConfig = {
    securityJsCode: import.meta.env.VITE_AMAP_SECURITY_CODE,
  };
}

const GlobalMapContainer: React.FC = () => {
  const mapRef = useRef<any>(null);
  const geojsonLayerRef = useRef<any>(null);
  const lastPolygonRef = useRef<any>(null);

  const geoDataRef = useRef<FeatureCollection | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [selectedInfo, setSelectedInfo] = useState<any>(null);

  /* =========================
     1. 加载 GeoJSON（不缓存，避免爆 storage）
     ========================= */
  useEffect(() => {
    const loadGeo = async () => {
      try {
        const res = await fetch("/data/convert.json");
        const data = await res.json();
        geoDataRef.current = data;
        setLoaded(true);
      } catch (e) {
        console.error("❌ GeoJSON 加载失败", e);
      }
    };
    loadGeo();
  }, []);

  /* =========================
     2. 产量接口 + 本地兜底
     ========================= */
  const fetchRegionYield = async (regionName: string) => {
    const url = `/api/map/region-data?country=${encodeURIComponent("中国")}`;
    console.log("➡️ 请求产量接口:", url);

    try {
      const res = await fetch(url);
      const text = await res.text();

      // 接口未命中（返回 HTML）
      if (text.trim().startsWith("<")) {
        throw new Error("HTML response");
      }

      const data = JSON.parse(text);

      return (
        data?.yield ??
        data?.yield_value ??
        data?.production ??
        data?.data?.yield ??
        0
      );
    } catch {
      console.warn("⚠️ 接口不可用，使用本地产量兜底:", regionName);
      return LOCAL_YIELD_MAP[regionName] ?? LOCAL_YIELD_MAP.DEFAULT;
    }
  };

  /* =========================
     3. 渲染 GeoJSON 图层
     ========================= */
  const renderGeoLayer = () => {
    const map = mapRef.current?.map;
    const AMap = (window as any).AMap;
    if (!map || !geoDataRef.current || !AMap?.GeoJSON) return;

    if (geojsonLayerRef.current) {
      map.remove(geojsonLayerRef.current);
    }

    const geojson = new AMap.GeoJSON({
      geoJSON: geoDataRef.current,
      getPolygon: (json: any, lnglats: any) =>
        new AMap.Polygon({
          path: lnglats,
          fillColor: "#40E0D0",
          fillOpacity: 0.5,
          strokeColor: "#ffffff",
          strokeWeight: 1,
          bubble: true,
          cursor: "pointer",
          extData: json.properties,
        }),
    });

    geojson.on("click", async (e: any) => {
      const polygon = e.target;
      const props = polygon.getExtData();

      const regionName = props?.name || props?.admin_name || "DEFAULT";

      console.log("🗺️ 点击区域:", regionName);

      if (lastPolygonRef.current) {
        lastPolygonRef.current.setOptions({
          fillColor: "#40E0D0",
          fillOpacity: 0.5,
        });
      }

      polygon.setOptions({
        fillColor: "#ffeb3b",
        fillOpacity: 0.85,
      });
      lastPolygonRef.current = polygon;

      const yieldVal = await fetchRegionYield(regionName);

      setSelectedInfo({
        name: regionName,
        yieldVal,
      });

      map.setZoomAndCenter(7, polygon.getBounds().getCenter());
    });

    geojsonLayerRef.current = geojson;
    map.add(geojson);
  };

  /* =========================
     4. 地图初始化
     ========================= */
  useEffect(() => {
    if (!loaded) return;

    const timer = setInterval(() => {
      const map = mapRef.current?.map;
      if (!map) return;

      map.setCenter([105, 36]);
      map.setZoom(5);
      map.setMapStyle("amap://styles/dark");

      renderGeoLayer();
      clearInterval(timer);
    }, 100);

    return () => clearInterval(timer);
  }, [loaded]);

  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <APILoader
        akey={import.meta.env.VITE_AMAP_KEY}
        plugins={["AMap.GeoJSON"]}
      >
        <AMapContainer ref={mapRef} style={{ width: "100%", height: "100%" }} />
      </APILoader>

      {/* 右侧信息栏 */}
      <div
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          width: 360,
          height: "100%",
          background: "#ffffff",
          padding: 32,
          boxShadow: "-8px 0 24px rgba(0,0,0,.2)",
          transform: selectedInfo ? "translateX(0)" : "translateX(100%)",
          transition: "0.4s",
          zIndex: 9999,
        }}
      >
        {selectedInfo && (
          <>
            <h2>{selectedInfo.name}</h2>
            <p style={{ fontSize: 12, color: "#64748b" }}>预测产量</p>
            <p style={{ fontSize: 48, fontWeight: 800 }}>
              {selectedInfo.yieldVal}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default GlobalMapContainer;
