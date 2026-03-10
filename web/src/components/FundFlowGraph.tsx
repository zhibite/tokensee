'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getAddressGraph } from '@/lib/api';
import type { GraphNode, GraphEdge } from '@/lib/types';

// ── Simple force-directed graph in pure SVG ─────────────────────────────────
// No external dependencies. Uses a spring-layout simulation computed in JS,
// then rendered as SVG elements.

const W = 720;
const H = 460;
const CENTER_R = 28;
const NODE_R    = 20;
const MIN_DIST  = 110;

interface Vec { x: number; y: number }

function runForceLayout(nodes: GraphNode[], edges: GraphEdge[]): Map<string, Vec> {
  const pos = new Map<string, Vec>();

  // Place center node at origin, others in a circle
  nodes.forEach((n, i) => {
    if (n.is_center) {
      pos.set(n.id, { x: W / 2, y: H / 2 });
    } else {
      const nonCenter = nodes.filter((x) => !x.is_center);
      const idx = nonCenter.indexOf(n);
      const angle = (2 * Math.PI * idx) / Math.max(nonCenter.length, 1);
      const r = Math.min(W, H) * 0.36;
      pos.set(n.id, { x: W / 2 + r * Math.cos(angle), y: H / 2 + r * Math.sin(angle) });
    }
  });

  // Run 80 iterations of spring + repulsion
  for (let iter = 0; iter < 80; iter++) {
    const forces = new Map<string, Vec>(nodes.map((n) => [n.id, { x: 0, y: 0 }]));

    // Spring forces along edges
    for (const e of edges) {
      const a = pos.get(e.source);
      const b = pos.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const spring = (d - MIN_DIST) * 0.02;
      const fx = (dx / d) * spring;
      const fy = (dy / d) * spring;
      const fa = forces.get(e.source)!;
      const fb = forces.get(e.target)!;
      fa.x += fx; fa.y += fy;
      fb.x -= fx; fb.y -= fy;
    }

    // Repulsion forces between all node pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i].id)!;
        const b = pos.get(nodes[j].id)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.1;
        const rep = 3000 / (d * d);
        const fx = (dx / d) * rep;
        const fy = (dy / d) * rep;
        forces.get(nodes[i].id)!.x -= fx;
        forces.get(nodes[i].id)!.y -= fy;
        forces.get(nodes[j].id)!.x += fx;
        forces.get(nodes[j].id)!.y += fy;
      }
    }

    // Apply forces (center node is fixed)
    for (const n of nodes) {
      if (n.is_center) continue;
      const p = pos.get(n.id)!;
      const f = forces.get(n.id)!;
      const damping = 0.5;
      p.x = Math.max(40, Math.min(W - 40, p.x + f.x * damping));
      p.y = Math.max(40, Math.min(H - 40, p.y + f.y * damping));
    }
  }

  return pos;
}

function formatUsd(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const ENTITY_COLORS: Record<string, string> = {
  exchange:   '#3b82f6',
  bridge:     '#8b5cf6',
  protocol:   '#06b6d4',
  fund:       '#f59e0b',
  whale:      '#ef4444',
  dao:        '#10b981',
  mixer:      '#6b7280',
  stablecoin: '#22d3ee',
};

export function FundFlowGraph({ address, chain }: { address: string; chain?: string }) {
  const [nodes, setNodes]       = useState<GraphNode[]>([]);
  const [edges, setEdges]       = useState<GraphEdge[]>([]);
  const [layout, setLayout]     = useState<Map<string, Vec>>(new Map());
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [hovered, setHovered]   = useState<string | null>(null);
  const [totalVol, setTotalVol] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getAddressGraph(address, chain)
      .then((res) => {
        if (!res.success) { setError('Failed to load graph'); return; }
        const { nodes: n, edges: e, total_volume_usd } = res.data;
        setNodes(n);
        setEdges(e);
        setTotalVol(total_volume_usd);
        setLayout(runForceLayout(n, e));
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, [address, chain]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-600 text-sm">
        Building fund flow graph…
      </div>
    );
  }

  if (error) {
    return <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">{error}</div>;
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-zinc-600 text-sm gap-2">
        <p>No large transfers found for this address.</p>
        <p className="text-xs text-zinc-700">Graph is built from whale_alerts data (≥ $100k transfers).</p>
      </div>
    );
  }

  // Scale edge width by volume
  const maxVol = Math.max(...edges.map((e) => e.volume_usd), 1);

  const hovNode = nodes.find((n) => n.id === hovered);

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex gap-6 text-xs text-zinc-500">
        <span>{nodes.length} addresses</span>
        <span>{edges.length} transfer paths</span>
        <span>{formatUsd(totalVol)} total volume</span>
      </div>

      <div className="relative rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          className="block"
          style={{ maxHeight: H }}
        >
          {/* Arrow marker */}
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#52525b" />
            </marker>
            <marker id="arrow-hot" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#a1a1aa" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((e) => {
            const a = layout.get(e.source);
            const b = layout.get(e.target);
            if (!a || !b) return null;
            const isHot = hovered === e.source || hovered === e.target;
            const edgeW = 1 + (e.volume_usd / maxVol) * 4;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const r = (nodes.find((n) => n.id === e.target)?.is_center ? CENTER_R : NODE_R);
            const ex = b.x - (dx / d) * (r + 10);
            const ey = b.y - (dy / d) * (r + 10);

            return (
              <line
                key={e.id}
                x1={a.x} y1={a.y} x2={ex} y2={ey}
                stroke={isHot ? '#a1a1aa' : '#3f3f46'}
                strokeWidth={isHot ? edgeW + 1 : edgeW}
                markerEnd={`url(#${isHot ? 'arrow-hot' : 'arrow'})`}
                strokeOpacity={isHot ? 1 : 0.6}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((n) => {
            const p = layout.get(n.id);
            if (!p) return null;
            const r = n.is_center ? CENTER_R : NODE_R;
            const isHot = hovered === n.id;
            const color = n.entity_type ? (ENTITY_COLORS[n.entity_type] ?? '#71717a') : '#71717a';
            const displayLabel = n.entity_name ?? n.label ?? (n.address.slice(0, 6) + '…' + n.address.slice(-4));

            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Glow ring on hover */}
                {isHot && (
                  <circle r={r + 6} fill="none" stroke={color} strokeWidth="1.5" opacity={0.3} />
                )}
                <circle
                  r={r}
                  fill={n.is_center ? color : '#18181b'}
                  stroke={color}
                  strokeWidth={n.is_center ? 0 : isHot ? 2 : 1.5}
                  opacity={isHot || n.is_center ? 1 : 0.85}
                />
                {n.is_center && (
                  <text textAnchor="middle" dy="1" fill="white" fontSize="9" fontWeight="600">
                    YOU
                  </text>
                )}
                <text
                  textAnchor="middle"
                  dy={r + 14}
                  fill={isHot ? '#e4e4e7' : '#71717a'}
                  fontSize={isHot ? '10' : '9'}
                  fontWeight={isHot ? '600' : '400'}
                >
                  {displayLabel.length > 12 ? displayLabel.slice(0, 12) + '…' : displayLabel}
                </text>
                {n.volume_usd > 0 && (
                  <text
                    textAnchor="middle"
                    dy={r + 26}
                    fill="#52525b"
                    fontSize="8"
                  >
                    {formatUsd(n.volume_usd)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Tooltip panel */}
        {hovNode && !hovNode.is_center && (
          <div className="absolute bottom-3 left-3 bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs max-w-xs">
            <p className="font-mono text-zinc-200 mb-1">{hovNode.address}</p>
            {hovNode.entity_name && <p className="text-zinc-400 mb-0.5">{hovNode.entity_name}</p>}
            {hovNode.label && <p className="text-zinc-600 mb-1">{hovNode.label}</p>}
            <div className="flex gap-3 text-zinc-500 mt-1">
              <span>{hovNode.tx_count} txns</span>
              <span>{formatUsd(hovNode.volume_usd)} vol</span>
              {hovNode.entity_type && <span className="capitalize">{hovNode.entity_type}</span>}
            </div>
            <Link
              href={`/address/${hovNode.address}`}
              className="block mt-2 text-violet-400 hover:text-violet-300"
            >
              View address →
            </Link>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-zinc-600">
        {Object.entries(ENTITY_COLORS).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1.5 capitalize">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
            {type}
          </span>
        ))}
      </div>
    </div>
  );
}
