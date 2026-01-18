/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef } from "react";
import { Map as AMapContainer, APILoader } from "@uiw/react-amap";
// 注意：如果这里报红，请确认你的 request 文件位置
import request from "../api/request";

interface RegionData {
  id: string;
  name: string;
  cropType: string;
  yieldVal: number;
}

// 模拟数据：扩大了经纬度范围，确保你在地图中心（105, 36）能一眼看到它
const MOCK_GEO_DATA = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        id: "mock-1",
        name: "演示行政区 (API超时自动加载)",
        crop: "谷物",
        yield_val: 78,
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [95, 30],
            [115, 30],
            [115, 42],
            [95, 42],
            [95, 30],
          ],
        ],
      },
    },
  ],
};

const GlobalMapContainer: React.FC = () => {
  const [selectedInfo, setSelectedInfo] = useState<RegionData | null>(null);
  const [geoData, setGeoData] = useState<any>(null);
  const mapRef = useRef<any>(null);

  // 获取数据逻辑
  useEffect(() => {
    const fetchGeoData = async () => {
      try {
        const data: any = await request.get("/gpkg/data", {
          params: { file: "file1", format: "geojson" },
          timeout: 2000, // 缩短超时，2秒连不上就切模拟数据
        });
        if (data) setGeoData(data);
      } catch {
        // 删掉 (err)
        console.warn("API连接超时，已切换至演示模拟数据。");
        setGeoData(MOCK_GEO_DATA);
      }
    };
    fetchGeoData();
  }, []);

  // 渲染行政区划逻辑
  useEffect(() => {
    const AMap = (window as any).AMap;
    const map = mapRef.current?.map;
    if (!map || !geoData || !AMap) return;

    // 清除旧图层并重新加载
    const geojson = new AMap.GeoJSON({
      geoJSON: geoData,
      getPolygon: (json: any, lnglats: any) => {
        const props = json.properties;
        const polygon = new AMap.Polygon({
          path: lnglats,
          fillOpacity: 0.7,
          fillColor: "#D08770",
          strokeColor: "#ffffff",
          strokeWeight: 1,
        });

        // 交互：变色与中心化
        polygon.on("mouseover", () =>
          polygon.setOptions({ fillColor: "#00F5FF", fillOpacity: 0.9 })
        );
        polygon.on("mouseout", () =>
          polygon.setOptions({ fillColor: "#D08770", fillOpacity: 0.7 })
        );
        polygon.on("click", () => {
          map.setFitView(polygon, false, [0, 400, 0, 0], 10);
          setSelectedInfo({
            id: props.id,
            name: props.name,
            cropType: props.crop,
            yieldVal: props.yield_val,
          });
        });
        return polygon;
      },
    });
    geojson.setMap(map);
    map.setFitView();
  }, [geoData]);

  return (
    <div className="relative w-full h-screen bg-[#00050a] overflow-hidden">
      <APILoader akey={import.meta.env.VITE_AMAP_KEY || ""}>
        {/* 使用 as any 解决 zoom 等属性不存在的 TS 报错 */}
        <AMapContainer
          ref={mapRef}
          style={{ width: "100%", height: "100%" }}
          {...({
            zoom: 4,
            center: [105, 36],
            mapStyle: "amap://styles/dark",
          } as any)}
        />
      </APILoader>

      {/* 肖老师要求的 1/3 屏幕白色侧边栏 */}
      <div
        className={`absolute top-0 right-0 w-1/3 h-full bg-white transition-transform duration-500 z-1001 p-10 shadow-2xl ${selectedInfo ? "translate-x-0" : "translate-x-full"}`}
      >
        {selectedInfo && (
          <div className="text-slate-800">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-3xl font-black">{selectedInfo.name}</h2>
              <button
                onClick={() => setSelectedInfo(null)}
                className="text-slate-300 hover:text-red-500 text-2xl"
              >
                ✕
              </button>
            </div>
            <div className="space-y-6">
              <div className="p-6 bg-slate-50 rounded-2xl">
                <p className="text-xs text-slate-400 font-bold mb-2">
                  预测产量 (万吨)
                </p>
                <p className="text-4xl font-black text-blue-600">
                  {selectedInfo.yieldVal}
                </p>
              </div>
              <div className="h-64 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-slate-300">
                ECharts 折线图预留位
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalMapContainer;
