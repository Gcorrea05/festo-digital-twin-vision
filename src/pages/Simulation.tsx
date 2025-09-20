// src/pages/Simulation/Simulation.tsx

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ThreeDModel from "@/components/dashboard/ThreeDModel";

export default function Simulation() {
  const [inputs, setInputs] = useState({
    tensao: "",
    pressao: "",
    velocidade: "",
    temperatura: "",
    vibracao: "",
  });

  const [resultado, setResultado] = useState("Aguardando dados...");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputs({ ...inputs, [e.target.name]: e.target.value });
  };

  const handleSimulate = () => {
    // 🚨 Por enquanto não há lógica real — só mock
    setResultado("Resultado: aguardando integração com backend");
  };

  return (
    <div className="p-6 space-y-6">
      {/* Título */}
      <h1 className="text-2xl font-bold">Simulation</h1>

      {/* 3D Model + Botões */}
      <Card className="shadow-md">
        <CardContent className="p-4 flex flex-col items-center space-y-4">
          <ThreeDModel />
          <div className="flex gap-4">
            <Button>Modelo 1</Button>
            <Button>Modelo 2</Button>
          </div>
        </CardContent>
      </Card>

      {/* Inputs */}
      <Card className="shadow-md">
        <CardContent className="p-4 space-y-4">
          <h2 className="text-xl font-semibold">Parâmetros de Entrada</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="number"
              name="tensao"
              placeholder="Tensão (V)"
              value={inputs.tensao}
              onChange={handleChange}
              className="border p-2 rounded-md w-full"
            />
            <input
              type="number"
              name="pressao"
              placeholder="Pressão (Pa)"
              value={inputs.pressao}
              onChange={handleChange}
              className="border p-2 rounded-md w-full"
            />
            <input
              type="number"
              name="velocidade"
              placeholder="Velocidade (m/s)"
              value={inputs.velocidade}
              onChange={handleChange}
              className="border p-2 rounded-md w-full"
            />
            <input
              type="number"
              name="temperatura"
              placeholder="Temperatura (°C)"
              value={inputs.temperatura}
              onChange={handleChange}
              className="border p-2 rounded-md w-full"
            />
            <input
              type="number"
              name="vibracao"
              placeholder="Vibração (Hz)"
              value={inputs.vibracao}
              onChange={handleChange}
              className="border p-2 rounded-md w-full"
            />
          </div>

          <Button className="mt-4 w-full" onClick={handleSimulate}>
            Simular
          </Button>
        </CardContent>
      </Card>

      {/* Resultado */}
      <Card className="shadow-md">
        <CardContent className="p-4">
          <h2 className="text-xl font-semibold mb-2">Resultado</h2>
          <p className="text-lg">{resultado}</p>
        </CardContent>
      </Card>
    </div>
  );
}
