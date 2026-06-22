/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState } from "react";
import { Map as AMapContainer, APILoader } from "@uiw/react-amap";
import type { FeatureCollection } from "geojson";

import ReactECharts from "echarts-for-react";

import "echarts-gl"; // CRITICAL: 必须引入 echarts-gl 才能渲染 3D 图表

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
  const countryPolygonsRef = useRef<any[]>([]);
  const countryDataRef = useRef<FeatureCollection | null>(null);
  const productionDataRef = useRef<any[]>([]);

  const [loaded, setLoaded] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false); // 价格预测弹窗
  const [is3DModalOpen, setIs3DModalOpen] = useState(false); // 3D混合数据弹窗
  const [northeastData, setNortheastData] = useState<any>(null);
  const [priceData, setPriceData] = useState<any>(null); // 世界价格数据
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const lastPolygonRef = useRef<any>(null);

  // --- 国家名称归一化 ---
  const normalizeCountryName = (name: string) => {
    const clean = name.replace(/\s/g, "");
    const map: Record<string, string> = {
      俄罗斯: "俄罗斯联邦",
      美国: "美利坚合众国",
    };
    return map[clean] || clean;
  };

  // --- 加载 GeoJSON ---
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

  // --- 加载全球产量数据 ---
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

  // 获取东北产量数据
  const fetchNortheastData = async () => {
    setLoading(true);
    const regions = ["黑龙江", "吉林", "辽宁"];
    const crops = ["水稻", "玉米", "大豆", "小麦"];
    const newData: any = {};

    try {
      await Promise.all(
        regions.map(async (region) => {
          const regionResults = await Promise.all(
            crops.map(async (crop) => {
              try {
                const res = await fetch(
                  `http://10.0.3.4:5000/api/prediction/yield?region=${encodeURIComponent(region)}&crop=${encodeURIComponent(crop)}`
                );
                const json = await res.json();
                return { crop, data: json.data };
              } catch {
                return { crop, data: { years: [], yield: [] } };
              }
            })
          );
          newData[region] = regionResults;
        })
      );
      setNortheastData(newData);
      setIsModalOpen(true);
    } catch (err) {
      console.error("API获取失败:", err);
    } finally {
      setLoading(false);
    }
  };

  // 获取世界价格预测数据（已适配：region, item 参数）
  const fetchGlobalPriceData = async () => {
    setLoading(true);
    const countriesList = [
      "美利坚合众国",
      "俄罗斯联邦",
      "中国",
      "加拿大",
      "印度",
      "大不列颠及北爱尔兰联合王国",
      "巴西",
      "法国",
      "澳大利亚",
      "阿根廷",
    ];
    const crops = ["水稻", "玉米", "大豆", "小麦"];
    const newData: any = {};

    const apiCountryMap: Record<string, string> = {
      美利坚合众国: "美国",
      俄罗斯联邦: "俄罗斯",
      大不列颠及北爱尔兰联合王国: "英国",
    };

    try {
      await Promise.all(
        countriesList.map(async (countryFull) => {
          const countryQuery = apiCountryMap[countryFull] || countryFull;

          const results = await Promise.all(
            crops.map(async (crop) => {
              try {
                const res = await fetch(
                  `http://10.0.3.4:5000/api/prediction/price?region=${encodeURIComponent(countryQuery)}&item=${encodeURIComponent(crop)}`
                );
                const json = await res.json();

                const apiData = json.data || {};
                const years = apiData.years || [];
                const prices = apiData.price || [];

                return {
                  crop,
                  data: {
                    years: years,
                    price: prices,
                  },
                };
              } catch {
                return { crop, data: { years: [], price: [] } };
              }
            })
          );
          newData[countryFull] = results;
        })
      );
      setPriceData(newData);
      setIsPriceModalOpen(true);
    } catch (err) {
      console.error("价格数据获取失败:", err);
    } finally {
      setLoading(false);
    }
  };

  const clearPolygons = () => {
    const map = mapRef.current?.map;
    if (!map) return;
    countryPolygonsRef.current.forEach((p) => map.remove(p));
    countryPolygonsRef.current = [];
  };

  const fetchProduction = (englishName: string, iso3: string) => {
    try {
      const chineseName = iso3
        ? countries.getName(iso3, "zh") || englishName
        : englishName;
      const normalizedQueryName = normalizeCountryName(chineseName);
      const countryRows = productionDataRef.current.filter((item: any) => {
        const apiName = item.country.replace(/\s/g, "");
        return apiName === normalizedQueryName;
      });
      setSelectedCountry({ name: chineseName, crops: countryRows });
    } catch (err) {
      console.error("筛选失败:", err);
      setSelectedCountry({ name: englishName, crops: [] });
    }
  };

  const handleSearch = () => {
    if (!searchQuery.trim() || !countryDataRef.current) return;
    const query = searchQuery.trim().toLowerCase();
    const foundFeature = countryDataRef.current.features.find((f: any) => {
      const props = f.properties ?? {};
      const zhName = props.iso3
        ? countries.getName(props.iso3, "zh") || ""
        : "";
      const enName = (props.country || props.ADMIN || "").toLowerCase();
      return zhName.includes(query) || enName.includes(query);
    });

    if (foundFeature) {
      const props = foundFeature.properties ?? {};
      const targetPolygon = countryPolygonsRef.current.find(
        (p) => p.getExtData()?.iso3 === props.iso3
      );
      if (targetPolygon) {
        if (lastPolygonRef.current) {
          lastPolygonRef.current.setOptions({
            fillColor: "#2563eb",
            fillOpacity: 0.35,
          });
        }
        targetPolygon.setOptions({ fillColor: "#fef9c3", fillOpacity: 0.8 });
        lastPolygonRef.current = targetPolygon;
        fetchProduction(
          props.country || props.ADMIN || "Unknown",
          props.iso3 || ""
        );
        const map = mapRef.current?.map;
        if (map) {
          const path = targetPolygon.getPath();
          if (path && path.length > 0) map.setCenter(path[0]);
        }
      }
    } else {
      alert("未找到该国家");
    }
  };

  const renderCountryOnce = () => {
    const map = mapRef.current?.map;
    const AMap = (window as any).AMap;
    if (!map || !countryDataRef.current) return;
    clearPolygons();

    countryDataRef.current.features.forEach((feature) => {
      const coords: any = (feature.geometry as any).coordinates;
      const props: any = feature.properties ?? {};
      const englishName = props.country || props.ADMIN || "Unknown";
      const iso3 = props.iso3 || "";

      const polygon = new AMap.Polygon({
        path: coords,
        fillColor: "#2563eb",
        fillOpacity: 0.35,
        strokeColor: "#ffffff",
        strokeWeight: 1,
        zIndex: 10,
        cursor: "pointer",
        extData: { iso3 },
      });

      polygon.on("click", () => {
        if (lastPolygonRef.current) {
          lastPolygonRef.current.setOptions({
            fillColor: "#2563eb",
            fillOpacity: 0.35,
          });
        }
        polygon.setOptions({ fillColor: "#fef9c3", fillOpacity: 0.8 });
        lastPolygonRef.current = polygon;
        fetchProduction(englishName, iso3);
      });
      map.add(polygon);
      countryPolygonsRef.current.push(polygon);
    });

    const neMarker = new AMap.Marker({
      position: [126.63, 45.75],
      content: `<div style="background:#ff4d4f; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid #fff; cursor:pointer; box-shadow:0 2px 10px rgba(0,0,0,0.4);"><span style="color:white; font-size:18px;">📍</span></div>`,
      zIndex: 100,
    });
    neMarker.on("click", fetchNortheastData);
    map.add(neMarker);
  };

  useEffect(() => {
    if (!loaded) return;
    const timer = setInterval(() => {
      const map = mapRef.current?.map;
      if (!map) return;
      map.setCenter([20, 10]);
      map.setZoom(2.2);
      map.setMapStyle("amap://styles/dark");
      renderCountryOnce();
      clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [loaded]);

  const getLineOption = (
    regionName: string,
    cropDataArray: any[],
    type: "yield" | "price" = "yield"
  ) => {
    if (!cropDataArray) return {};

    // --- 修改点：根据类型动态决定横轴显示的年份 ---
    const displayYears =
      type === "yield"
        ? [2024, 2025, 2026, 2027, 2028, 2029, 2030] // 产量预测保留 2024, 2025
        : [2026, 2027, 2028, 2029, 2030]; // 价格预测只保留 2026-2030

    const series = cropDataArray.map((cropItem: any) => {
      const apiYears = cropItem.data?.years || [];
      const apiValues =
        type === "yield"
          ? cropItem.data?.yield || []
          : cropItem.data?.price || [];

      const dataMap = new Map();
      apiYears.forEach((year: any, index: number) => {
        dataMap.set(Number(year), apiValues[index]);
      });
      return {
        name: cropItem.crop,
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 8,
        data: displayYears.map((y) => (dataMap.has(y) ? dataMap.get(y) : null)),
      };
    });

    return {
      title: {
        text: `${regionName}粮食${type === "yield" ? "产量" : "价格"}预测`,
        left: "center",
        textStyle: { color: "#334155", fontSize: 18, fontWeight: "bold" },
      },
      tooltip: { trigger: "axis" },
      legend: {
        show: true,
        bottom: "5%",
        icon: "roundRect",
        textStyle: { color: "#334155", fontSize: 13 },
      },
      grid: {
        top: "18%",
        left: "5%",
        right: "8%",
        bottom: "18%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        name: "年",
        data: displayYears,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#94a3b8" } },
      },
      yAxis: {
        type: "value",
        name: type === "yield" ? "产量 (万吨)" : "价格 (单位/吨)",
        splitLine: { lineStyle: { type: "dashed", color: "#e2e8f0" } },
      },
      series: series,
      color: ["#3b82f6", "#10b981", "#f59e0b", "#a855f7"],
    };
  };

  // --- 生成新增的 3D 柱状图配置 ---
  const get3DBarOption = () => {
    // 维度定义：0: 年份, 1: 产量(万吨), 2: 价格(单位/吨), 3: 作物类型
    const mock3DData = [
      // 2026
      [2026, 4500, 2400, "小麦"],
      [2026, 5200, 1800, "玉米"],
      [2026, 1800, 4200, "大豆"],
      [2026, 6000, 2600, "水稻"],
      // 2027
      [2027, 4650, 2450, "小麦"],
      [2027, 5400, 1750, "玉米"],
      [2027, 1900, 4300, "大豆"],
      [2027, 6100, 2680, "水稻"],
      // 2028
      [2028, 4800, 2500, "小麦"],
      [2028, 5500, 1900, "玉米"],
      [2028, 2100, 4100, "大豆"],
      [2028, 6250, 2750, "水稻"],
      // 2029
      [2029, 4900, 2600, "小麦"],
      [2029, 5700, 2000, "玉米"],
      [2029, 2200, 4450, "大豆"],
      [2029, 6300, 2800, "水稻"],
      // 2030
      [2030, 5100, 2550, "小麦"],
      [2030, 5900, 2100, "玉米"],
      [2030, 2350, 4600, "大豆"],
      [2030, 6500, 2900, "水稻"],
    ];

    return {
      title: {
        text: "全球主要作物多维时空预测 (年份 - 产量 - 价格)",
        left: "center",
        textStyle: { color: "#334155", fontSize: 20, fontWeight: "bold" },
      },
      tooltip: {
        formatter: (params: any) => {
          const val = params.value;
          return `<b>${val[3]} (${val[0]}年)</b><br/>
                  预期产量: ${val[1]} 万吨<br/>
                  预期价格: ${val[2]} 单位/吨`;
        },
      },
      visualMap: {
        max: 6500,
        inRange: {
          color: [
            "#313695",
            "#4575b4",
            "#74add1",
            "#abd9e9",
            "#e0f3f8",
            "#ffffbf",
            "#fee090",
            "#fdae61",
            "#f46d43",
            "#d73027",
            "#a50026",
          ],
        },
        componentIndex: 0,
        dimension: 1, // 绑定产量颜色映射
        orient: "horizontal",
        left: "center",
        bottom: "2%",
        text: ["高产量", "低产量"],
        textStyle: { color: "#334155" },
      },
      dataset: {
        dimensions: ["年份", "产量", "价格", "作物"],
        source: mock3DData,
      },
      xAxis3D: {
        type: "category",
        name: "年份",
        title2d: "年",
        axisLabel: { textStyle: { color: "#334155" } },
      },
      yAxis3D: {
        type: "value",
        name: "产量(万吨)",
        axisLabel: { textStyle: { color: "#334155" } },
      },
      zAxis3D: {
        type: "value",
        name: "价格(单位/吨)",
        axisLabel: { textStyle: { color: "#334155" } },
      },
      grid3D: {
        boxWidth: 100,
        boxDepth: 80,
        boxHeight: 80,
        viewControl: {
          projection: "perspective",
          autoRotate: true,
          autoRotateSpeed: 6,
          beta: 25,
          alpha: 20,
        },
        light: {
          main: {
            intensity: 1.2,
            shadow: true,
          },
          ambient: {
            intensity: 0.4,
          },
        },
      },
      series: [
        {
          type: "bar3D",
          shading: "lambert",
          encode: {
            x: "年份",
            y: "产量",
            z: "价格",
            tooltip: [0, 1, 2, 3],
          },
          label: {
            show: false,
          },
          emphasis: {
            label: {
              show: true,
              formatter: (p: any) => p.value[3],
              textStyle: {
                fontSize: 16,
                color: "#000",
                backgroundColor: "#fff",
                padding: 4,
                borderRadius: 4,
              },
            },
          },
        },
      ],
    };
  };

  const groupByYear = (data: any[]) => {
    const map: Record<string, any[]> = {};
    data.forEach((item) => {
      if (!map[item.year]) map[item.year] = [];
      map[item.year].push(item);
    });
    return map;
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* 搜索栏 & 价格预测按钮 & 新增的3D混合视图按钮 */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          zIndex: 1000,
          display: "flex",
          gap: "12px",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "10px",
            background: "rgba(255,255,255,0.9)",
            padding: "8px 15px",
            borderRadius: "30px",
            boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "18px" }}>🔍</span>
          <input
            type="text"
            placeholder="搜索国家..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            style={{
              border: "none",
              outline: "none",
              background: "transparent",
              width: "180px",
            }}
          />
          <button
            onClick={handleSearch}
            style={{
              background: "#2563eb",
              color: "white",
              border: "none",
              padding: "5px 15px",
              borderRadius: "20px",
              cursor: "pointer",
            }}
          >
            搜索
          </button>
        </div>

        {/* 价格预测按钮 */}
        <button
          onClick={fetchGlobalPriceData}
          style={{
            background: "#10b981",
            color: "white",
            border: "none",
            padding: "10px 20px",
            borderRadius: "30px",
            cursor: "pointer",
            boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          📈 价格预测
        </button>

        {/* 新增：浅蓝色 3D 图表弹窗触发按钮 */}
        <button
          onClick={() => setIs3DModalOpen(true)}
          style={{
            background: "#60a5fa",
            color: "white",
            border: "none",
            padding: "10px 20px",
            borderRadius: "30px",
            cursor: "pointer",
            boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
          title="多维作物时空预测"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
          多维时空推演
        </button>
      </div>

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
              <h2 style={{ margin: 0 }}>{selectedCountry.name}</h2>
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
              {Object.entries(groupByYear(selectedCountry.crops)).map(
                ([year, rows], idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: 40,
                      padding: 16,
                      background: "#f8fafc",
                      borderRadius: 10,
                    }}
                  >
                    <h3>{year}年产量</h3>
                    <ReactECharts
                      option={{
                        tooltip: { trigger: "item" },
                        series: [
                          {
                            type: "pie",
                            radius: "60%",
                            data: rows.map((r) => ({
                              value: r.production,
                              name: r.crop,
                            })),
                          },
                        ],
                      }}
                      style={{ height: 300 }}
                    />
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>

      {/* 东北产量弹窗 */}
      {isModalOpen && northeastData && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
          onClick={() => setIsModalOpen(false)}
        >
          <div
            style={{
              width: "90%",
              maxWidth: "1300px",
              maxHeight: "90vh",
              backgroundColor: "#fff",
              borderRadius: "24px",
              padding: "30px",
              overflowY: "auto",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "20px",
              }}
            >
              <h2>东北三省粮食预期数据展示</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  border: "none",
                  background: "#eee",
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
            <h3
              style={{
                borderLeft: "4px solid #2563eb",
                paddingLeft: "10px",
                marginBottom: "20px",
              }}
            >
              东北三省粮食预期产量
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
                gap: "25px",
              }}
            >
              {Object.keys(northeastData).map((province) => (
                <div
                  key={province}
                  style={{
                    background: "#fff",
                    padding: "20px",
                    borderRadius: "16px",
                    border: "1px solid #f1f5f9",
                  }}
                >
                  <ReactECharts
                    option={getLineOption(
                      province,
                      northeastData[province],
                      "yield"
                    )}
                    style={{ height: "450px" }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 世界国家价格预测弹窗 */}
      {isPriceModalOpen && priceData && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
          onClick={() => setIsPriceModalOpen(false)}
        >
          <div
            style={{
              width: "90%",
              maxWidth: "1300px",
              maxHeight: "90vh",
              backgroundColor: "#fff",
              borderRadius: "24px",
              padding: "30px",
              overflowY: "auto",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "20px",
              }}
            >
              <h2>世界主要国家粮食价格预测</h2>
              <button
                onClick={() => setIsPriceModalOpen(false)}
                style={{
                  border: "none",
                  background: "#eee",
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
                gap: "25px",
              }}
            >
              {[
                "美利坚合众国",
                "俄罗斯联邦",
                "中国",
                "加拿大",
                "印度",
                "大不列颠及北爱尔兰联合王国",
                "巴西",
                "法国",
                "澳大利亚",
                "阿根廷",
              ].map((country) => {
                const finalOption = getLineOption(
                  country,
                  priceData[country] || [],
                  "price"
                );

                return (
                  <div
                    key={country}
                    style={{
                      background: "#fff",
                      padding: "20px",
                      borderRadius: "16px",
                      border: "1px solid #f1f5f9",
                    }}
                  >
                    <ReactECharts
                      option={finalOption}
                      style={{ height: "450px" }}
                      key={`${country}-chart`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 新增：3D 柱状图时空预测弹窗 */}
      {is3DModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
          onClick={() => setIs3DModalOpen(false)}
        >
          <div
            style={{
              width: "85%",
              maxWidth: "1100px",
              height: "80vh",
              backgroundColor: "#ffffff",
              borderRadius: "24px",
              padding: "35px",
              display: "flex",
              flexDirection: "column",
              position: "relative",
              boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "15px",
                borderBottom: "1px solid #f1f5f9",
                paddingBottom: "15px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <span style={{ fontSize: "24px" }}>📊</span>
                <h2 style={{ margin: 0, color: "#1e293b" }}>
                  三维混合数据多维分析
                </h2>
              </div>
              <button
                onClick={() => setIs3DModalOpen(false)}
                style={{
                  border: "none",
                  background: "#f1f5f9",
                  color: "#64748b",
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  cursor: "pointer",
                  fontSize: "18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.2s",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.background = "#e2e8f0")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.background = "#f1f5f9")
                }
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, width: "100%", minHeight: 0 }}>
              <ReactECharts
                option={get3DBarOption()}
                style={{ width: "100%", height: "100%" }}
                opts={{ renderer: "canvas" }}
              />
            </div>

            <div
              style={{
                fontSize: "13px",
                color: "#64748b",
                marginTop: "10px",
                textAlign: "right",
              }}
            >
              * 提示：鼠标按住左键拖拽可旋转视角，鼠标滚轮可缩放图表大小。
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(0,0,0,0.8)",
            color: "#fff",
            padding: "20px 40px",
            borderRadius: "40px",
            zIndex: 10001,
          }}
        >
          🚀 正在获取预测数据...
        </div>
      )}
    </div>
  );
};

export default GlobalMapContainer;
