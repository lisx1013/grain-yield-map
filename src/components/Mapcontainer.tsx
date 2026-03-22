/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState } from "react";
import { Map as AMapContainer, APILoader } from "@uiw/react-amap";
import type { FeatureCollection } from "geojson";

import ReactECharts from "echarts-for-react";

import countries from "i18n-iso-countries";
import zhLocale from "i18n-iso-countries/langs/zh.json";

countries.registerLocale(zhLocale);

if (typeof window !== "undefined") {
  (window as any)._AMapSecurityConfig = {
    securityJsCode: import.meta.env.VITE_AMAP_SECURITY_CODE,
  };
}

const GlobalMapContainer: React.FC = () => {
  const mapRef = useRef<any>(null);
  const printedRef = useRef(false);
  const countryPolygonsRef = useRef<any[]>([]);
  const countryDataRef = useRef<FeatureCollection | null>(null);

  const productionDataRef = useRef<any[]>([]);

  const [loaded, setLoaded] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const lastPolygonRef = useRef<any>(null);

  const normalizeCountryName = (name: string) => {
    const clean = name.replace(/\s/g, "");

    const map: Record<string, string> = {
      俄罗斯: "俄罗斯联邦",
      美国: "美利坚合众国",
    };

    return map[clean] || clean;
  };

  useEffect(() => {
    const load = async () => {
      try {
        const countryRes = await fetch("/data/world_country.json");
        countryDataRef.current = await countryRes.json();
        setLoaded(true);
      } catch (err) {
        console.error("GeoJSON加载失败:", err);
      }
    };

    load();
  }, []);

  useEffect(() => {
    const loadProduction = async () => {
      try {
        const res = await fetch(`http://10.0.3.4:5000/api/crops/production`);
        const data = await res.json();
        productionDataRef.current = data.data || [];
      } catch (err) {
        console.error("产量数据加载失败:", err);
      }
    };

    loadProduction();
  }, []);

  const clearPolygons = () => {
    const map = mapRef.current?.map;
    if (!map) return;

    countryPolygonsRef.current.forEach((p) => map.remove(p));
    countryPolygonsRef.current = [];
  };

  const fetchProduction = async (englishName: string, iso3: string) => {
    setLoading(true);

    try {
      const chineseName = countries.getName(iso3, "zh") || englishName;

      const normalizedQueryName = normalizeCountryName(chineseName);

      const countryRows = productionDataRef.current.filter((item: any) => {
        if (item.country.includes(" ")) return false;

        const apiName = item.country.replace(/\s/g, "");

        return apiName === normalizedQueryName;
      });

      setSelectedCountry({
        name: chineseName,
        crops: countryRows,
      });
    } catch (err) {
      console.error("数据筛选失败:", err);

      setSelectedCountry({
        name: englishName,
        crops: [],
      });
    }

    setLoading(false);
  };

  const renderCountryOnce = () => {
    const map = mapRef.current?.map;
    const AMap = (window as any).AMap;

    if (!map || !countryDataRef.current) return;

    clearPolygons();

    countryDataRef.current.features.forEach((feature) => {
      if (!feature.geometry) return;

      const coords: any = (feature.geometry as any).coordinates;
      const props: any = feature.properties;

      if (!printedRef.current) {
        console.log("国家属性字段:", props);
        printedRef.current = true;
      }

      const englishName =
        props?.country ||
        props?.ADMIN ||
        props?.NAME ||
        props?.name ||
        "Unknown";

      const iso3 = props?.iso3 || "";

      const polygon = new AMap.Polygon({
        path: coords,
        fillColor: "#2563eb",
        fillOpacity: 0.35,
        strokeColor: "#ffffff",
        strokeWeight: 1,
        zIndex: 10,
        cursor: "pointer",
      });

      polygon.on("click", () => {
        if (lastPolygonRef.current) {
          lastPolygonRef.current.setOptions({
            fillColor: "#2563eb",
            fillOpacity: 0.35,
          });
        }

        polygon.setOptions({
          fillColor: "#facc15",
          fillOpacity: 0.8,
        });

        lastPolygonRef.current = polygon;

        fetchProduction(englishName, iso3);
      });

      map.add(polygon);
      countryPolygonsRef.current.push(polygon);
    });
  };

  useEffect(() => {
    if (!loaded) return;

    const timer = setInterval(() => {
      const map = mapRef.current?.map;

      if (!map) return;

      map.setCenter([105, 36]);
      map.setZoom(3);
      map.setMapStyle("amap://styles/dark");

      renderCountryOnce();

      clearInterval(timer);
    }, 100);

    return () => clearInterval(timer);
  }, [loaded]);

  /* =========================
     按年份分组
  ========================= */

  const groupByYear = (data: any[]) => {
    const map: Record<string, any[]> = {};

    data.forEach((item) => {
      if (!map[item.year]) map[item.year] = [];
      map[item.year].push(item);
    });

    return map;
  };

  /* =========================
     ECharts配置
  ========================= */

  const getPieOption = (rows: any[], year: string) => {
    return {
      tooltip: {
        trigger: "item",
      },
      legend: {
        orient: "vertical",
        right: 0,
      },
      series: [
        {
          name: year,
          type: "pie",
          radius: "65%",
          center: ["40%", "50%"],
          label: {
            formatter: "{b}: {c}",
          },
          labelLine: {
            length: 15,
            length2: 10,
          },
          data: rows.map((r) => ({
            value: r.production,
            name: r.crop,
          })),
          emphasis: {
            itemStyle: {
              shadowBlur: 20,
              shadowOffsetX: 0,
            },
          },
        },
      ],
    };
  };

  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <APILoader akey={import.meta.env.VITE_AMAP_KEY}>
        <AMapContainer ref={mapRef} style={{ width: "100%", height: "100%" }} />
      </APILoader>

      {/* 侧边栏 */}

      <div
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          width: 460,
          height: "100%",
          background: "#ffffff",
          boxShadow: "-10px 0 30px rgba(0,0,0,.3)",
          transform: selectedCountry ? "translateX(0)" : "translateX(100%)",
          transition: "0.35s ease",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {selectedCountry && (
          <>
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <h2>{selectedCountry.name}</h2>

              <button
                onClick={() => setSelectedCountry(null)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 22,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 24, overflowY: "auto" }}>
              {loading && <p>加载中...</p>}

              {!loading && selectedCountry.crops?.length === 0 && (
                <p>暂无数据</p>
              )}

              {!loading &&
                Object.entries(
                  groupByYear(selectedCountry.crops) as Record<string, any[]>
                ).map(([year, rows], index) => (
                  <div
                    key={index}
                    style={{
                      marginBottom: 40,
                      padding: 16,
                      background: "#f8fafc",
                      borderRadius: 10,
                    }}
                  >
                    <h3 style={{ marginBottom: 10 }}>{year}年作物产量</h3>

                    <ReactECharts
                      option={getPieOption(rows, year)}
                      style={{ height: 300 }}
                    />
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default GlobalMapContainer;
