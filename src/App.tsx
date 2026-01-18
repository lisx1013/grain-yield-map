import GlobalMapContainer from "./components/Mapcontainer";

function App() {
  return (
    // min-h-screen 确保容器占满全屏，让地图有显示空间
    <main className="w-full min-h-screen">
      <GlobalMapContainer />
    </main>
  );
}

export default App;
