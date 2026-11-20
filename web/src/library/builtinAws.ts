import { ItemBuilder } from './ItemBuilder';
import type { BuiltinDef } from './builtin';

/**
 * Built-in library sections for AWS architecture diagrams: service tiles, grouping boxes (AWS
 * Cloud, Region, VPC, Availability Zone, subnets…) and ready-made reference architectures.
 *
 * Tiles are SketchBoard's own: a square coloured by service category with a simple generic
 * symbol (server, bucket, cylinder…) and the service's name. They are not AWS's official
 * architecture icons, which are AWS's artwork.
 */

type Pt = [number, number];

const GREY = '#868e96';
const WHITE = '#ffffff';

/** Category colours (a tile's fill; groups use the same family). */
const CAT = {
  compute: '#e8590c',
  storage: '#2f9e44',
  database: '#1971c2',
  network: '#6741d9',
  integration: '#c2255c',
  security: '#e03131',
  analytics: '#0c8599',
  management: '#5c7cfa',
  general: '#495057',
} as const;
type Cat = keyof typeof CAT;

type Glyph =
  | 'server' | 'lambda' | 'containers' | 'k8s' | 'bucket' | 'disk' | 'folder' | 'cylinder' | 'table' | 'bolt'
  | 'lock' | 'globe' | 'signpost' | 'gateway' | 'balancer' | 'queue' | 'broadcast' | 'bus' | 'flow' | 'idcard'
  | 'person' | 'shield' | 'key' | 'waves' | 'bars' | 'magnifier' | 'nodes' | 'chart' | 'users';

interface Service {
  name: string;
  short: string;
  role: string;
  cat: Cat;
  glyph: Glyph;
}

const SERVICES: Record<string, Service> = {
  ec2: { name: 'Amazon EC2', short: 'EC2', role: 'Virtual servers', cat: 'compute', glyph: 'server' },
  lambda: { name: 'AWS Lambda', short: 'Lambda', role: 'Serverless functions', cat: 'compute', glyph: 'lambda' },
  ecs: { name: 'Amazon ECS', short: 'ECS', role: 'Containers', cat: 'compute', glyph: 'containers' },
  eks: { name: 'Amazon EKS', short: 'EKS', role: 'Kubernetes', cat: 'compute', glyph: 'k8s' },
  s3: { name: 'Amazon S3', short: 'S3', role: 'Object storage', cat: 'storage', glyph: 'bucket' },
  ebs: { name: 'Amazon EBS', short: 'EBS', role: 'Block storage', cat: 'storage', glyph: 'disk' },
  efs: { name: 'Amazon EFS', short: 'EFS', role: 'File storage', cat: 'storage', glyph: 'folder' },
  rds: { name: 'Amazon RDS', short: 'RDS', role: 'Relational database', cat: 'database', glyph: 'cylinder' },
  aurora: { name: 'Amazon Aurora', short: 'Aurora', role: 'Relational database', cat: 'database', glyph: 'cylinder' },
  dynamodb: { name: 'Amazon DynamoDB', short: 'DynamoDB', role: 'NoSQL database', cat: 'database', glyph: 'table' },
  elasticache: { name: 'Amazon ElastiCache', short: 'ElastiCache', role: 'In-memory cache', cat: 'database', glyph: 'bolt' },
  vpc: { name: 'Amazon VPC', short: 'VPC', role: 'Private network', cat: 'network', glyph: 'lock' },
  cloudfront: { name: 'Amazon CloudFront', short: 'CloudFront', role: 'CDN', cat: 'network', glyph: 'globe' },
  route53: { name: 'Amazon Route 53', short: 'Route 53', role: 'DNS', cat: 'network', glyph: 'signpost' },
  apigw: { name: 'Amazon API Gateway', short: 'API Gateway', role: 'Managed APIs', cat: 'network', glyph: 'gateway' },
  elb: { name: 'Elastic Load Balancing', short: 'Load balancer', role: 'ALB / NLB', cat: 'network', glyph: 'balancer' },
  sqs: { name: 'Amazon SQS', short: 'SQS', role: 'Message queue', cat: 'integration', glyph: 'queue' },
  sns: { name: 'Amazon SNS', short: 'SNS', role: 'Pub/sub notifications', cat: 'integration', glyph: 'broadcast' },
  eventbridge: { name: 'Amazon EventBridge', short: 'EventBridge', role: 'Event bus', cat: 'integration', glyph: 'bus' },
  stepfunctions: { name: 'AWS Step Functions', short: 'Step Functions', role: 'Workflows', cat: 'integration', glyph: 'flow' },
  iam: { name: 'AWS IAM', short: 'IAM', role: 'Users, roles, policies', cat: 'security', glyph: 'idcard' },
  cognito: { name: 'Amazon Cognito', short: 'Cognito', role: 'User sign-in', cat: 'security', glyph: 'person' },
  waf: { name: 'AWS WAF', short: 'WAF', role: 'Web firewall', cat: 'security', glyph: 'shield' },
  kms: { name: 'AWS KMS', short: 'KMS', role: 'Encryption keys', cat: 'security', glyph: 'key' },
  kinesis: { name: 'Amazon Kinesis', short: 'Kinesis', role: 'Data streaming', cat: 'analytics', glyph: 'waves' },
  redshift: { name: 'Amazon Redshift', short: 'Redshift', role: 'Data warehouse', cat: 'analytics', glyph: 'bars' },
  athena: { name: 'Amazon Athena', short: 'Athena', role: 'SQL on S3', cat: 'analytics', glyph: 'magnifier' },
  sagemaker: { name: 'Amazon SageMaker', short: 'SageMaker', role: 'Machine learning', cat: 'analytics', glyph: 'nodes' },
  cloudwatch: { name: 'Amazon CloudWatch', short: 'CloudWatch', role: 'Logs & metrics', cat: 'management', glyph: 'chart' },
  users: { name: 'Users', short: 'Users', role: 'Browsers & apps', cat: 'general', glyph: 'users' },
  internet: { name: 'Internet', short: 'Internet', role: 'Public internet', cat: 'general', glyph: 'globe' },
};

const W = { strokeColor: WHITE, strokeWidth: 2, roughness: 0.35 } as const;

/** A generic white symbol drawn inside a tile at (x, y) of size s. */
function glyph(b: ItemBuilder, g: Glyph, x: number, y: number, s: number) {
  const u = s / 64;
  const P = (px: number, py: number): Pt => [x + px * u, y + py * u];
  const rect = (px: number, py: number, w: number, h: number) => b.rect(x + px * u, y + py * u, w * u, h * u, { ...W, rounded: true });
  const ell = (px: number, py: number, w: number, h: number, fill = false) =>
    b.ellipse(x + px * u, y + py * u, w * u, h * u, fill ? { ...W, backgroundColor: WHITE, fillStyle: 'solid' } : W);
  const line = (pts: Pt[], o = {}) => b.line(pts, { ...W, sharp: true, ...o });
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number) =>
    line(Array.from({ length: 9 }, (_, i) => P(cx + Math.cos(a0 + ((a1 - a0) * i) / 8) * r, cy + Math.sin(a0 + ((a1 - a0) * i) / 8) * r)), { sharp: false });
  const cylinder = (px: number, py: number, w: number, h: number) => {
    ell(px, py, w, 8);
    line([P(px, py + 4), P(px, py + h - 4)]);
    line([P(px + w, py + 4), P(px + w, py + h - 4)]);
    arc(px + w / 2, py + h - 4, w / 2, 0, Math.PI);
  };
  switch (g) {
    case 'server':
      [14, 28, 42].forEach((py) => {
        rect(16, py, 32, 10);
        ell(20, py + 3, 4, 4, true);
      });
      break;
    case 'lambda':
      b.label('λ', x + s / 2, y + s / 2, { size: 38 * u, bold: true, color: WHITE, family: 'normal' });
      break;
    case 'containers':
      [[14, 14], [34, 14], [14, 34], [34, 34]].forEach(([px, py]) => rect(px, py, 16, 16));
      break;
    case 'k8s':
      b.polygon([0, 1, 2, 3, 4, 5].map((i) => P(32 + Math.cos((i * Math.PI) / 3 + Math.PI / 6) * 20, 32 + Math.sin((i * Math.PI) / 3 + Math.PI / 6) * 20)), W);
      ell(26, 26, 12, 12);
      break;
    case 'bucket':
      b.polygon([P(14, 18), P(50, 18), P(44, 50), P(20, 50)], W);
      ell(14, 13, 36, 10);
      break;
    case 'disk':
      [16, 28, 40].forEach((py) => rect(14, py, 36, 9));
      break;
    case 'folder':
      b.polygon([P(12, 20), P(26, 20), P(30, 25), P(52, 25), P(52, 47), P(12, 47)], W);
      break;
    case 'cylinder':
      cylinder(18, 14, 28, 36);
      break;
    case 'table':
      rect(13, 16, 38, 32);
      line([P(13, 27), P(51, 27)]);
      line([P(13, 37), P(51, 37)]);
      line([P(26, 16), P(26, 48)]);
      break;
    case 'bolt':
      cylinder(14, 14, 26, 34);
      b.polygon([P(44, 18), P(36, 36), P(43, 36), P(39, 50), P(52, 30), P(45, 30), P(49, 18)], { ...W, backgroundColor: WHITE, fillStyle: 'solid' });
      break;
    case 'lock':
      rect(18, 30, 28, 20);
      arc(32, 30, 9, Math.PI, Math.PI * 2);
      line([P(23, 30), P(23, 26)]);
      line([P(41, 30), P(41, 26)]);
      break;
    case 'globe':
      ell(14, 14, 36, 36);
      ell(24, 14, 16, 36);
      line([P(14, 32), P(50, 32)]);
      break;
    case 'signpost':
      line([P(32, 12), P(32, 52)]);
      b.polygon([P(18, 16), P(44, 16), P(50, 21), P(44, 26), P(18, 26)], W);
      b.polygon([P(46, 31), P(20, 31), P(14, 36), P(20, 41), P(46, 41)], W);
      break;
    case 'gateway':
      b.label('{ }', x + s / 2, y + s / 2, { size: 30 * u, bold: true, color: WHITE, family: 'code' });
      break;
    case 'balancer':
      ell(12, 26, 12, 12, true);
      [16, 32, 48].forEach((py) => line([P(24, 32), P(48, py)]));
      [16, 32, 48].forEach((py) => ell(46, py - 4, 8, 8, true));
      break;
    case 'queue':
      rect(10, 22, 44, 20);
      [21, 32, 43].forEach((px) => line([P(px, 22), P(px, 42)]));
      break;
    case 'broadcast':
      ell(27, 27, 10, 10, true);
      arc(32, 32, 13, -0.8, 0.8);
      arc(32, 32, 20, -0.8, 0.8);
      arc(32, 32, 13, Math.PI - 0.8, Math.PI + 0.8);
      arc(32, 32, 20, Math.PI - 0.8, Math.PI + 0.8);
      break;
    case 'bus':
      line([P(10, 24), P(54, 24)]);
      [18, 32, 46].forEach((px) => {
        line([P(px, 24), P(px, 38)]);
        ell(px - 5, 38, 10, 10, true);
      });
      break;
    case 'flow':
      rect(24, 10, 16, 12);
      rect(10, 42, 16, 12);
      rect(38, 42, 16, 12);
      line([P(32, 22), P(32, 32), P(18, 32), P(18, 42)]);
      line([P(32, 32), P(46, 32), P(46, 42)]);
      break;
    case 'idcard':
      rect(10, 16, 44, 32);
      ell(16, 24, 12, 12);
      line([P(34, 26), P(48, 26)]);
      line([P(34, 34), P(46, 34)]);
      line([P(16, 42), P(28, 42)]);
      break;
    case 'person':
      ell(24, 12, 16, 16);
      arc(32, 50, 16, Math.PI, Math.PI * 2);
      break;
    case 'shield':
      b.polygon([P(32, 10), P(50, 17), P(48, 36), P(32, 54), P(16, 36), P(14, 17)], W);
      line([P(24, 32), P(30, 38), P(41, 26)]);
      break;
    case 'key':
      ell(12, 22, 20, 20);
      line([P(32, 32), P(54, 32)]);
      line([P(46, 32), P(46, 40)]);
      line([P(52, 32), P(52, 38)]);
      break;
    case 'waves':
      [20, 32, 44].forEach((py) => line(Array.from({ length: 9 }, (_, i) => P(10 + i * 5.5, py + Math.sin(i * 1.2) * 4)), { sharp: false }));
      break;
    case 'bars':
      [[14, 34, 16], [27, 22, 28], [40, 14, 36]].forEach(([px, py, h]) => b.rect(x + px * u, y + py * u, 9 * u, h * u, { ...W, backgroundColor: WHITE, fillStyle: 'solid' }));
      line([P(10, 51), P(54, 51)]);
      break;
    case 'magnifier':
      ell(12, 12, 28, 28);
      line([P(36, 36), P(52, 52)], { strokeWidth: 3 });
      break;
    case 'nodes':
      [[32, 14], [16, 44], [48, 44], [32, 32]].forEach(([cx, cy]) => ell(cx - 6, cy - 6, 12, 12, true));
      line([P(32, 14), P(32, 32)]);
      line([P(16, 44), P(32, 32), P(48, 44)]);
      line([P(16, 44), P(48, 44)]);
      break;
    case 'chart':
      rect(10, 14, 44, 36);
      line([P(15, 42), P(25, 32), P(33, 37), P(42, 24), P(49, 28)]);
      break;
    case 'users':
      ell(14, 16, 14, 14);
      arc(21, 46, 12, Math.PI, Math.PI * 2);
      ell(36, 16, 14, 14);
      arc(43, 46, 12, Math.PI, Math.PI * 2);
      break;
  }
  return b;
}

/** A service tile at (x, y) of size s; the label (name, or short name) is centred below. */
function tile(b: ItemBuilder, key: string, x: number, y: number, s = 48, o: { full?: boolean; label?: string } = {}) {
  const svc = SERVICES[key];
  b.rect(x, y, s, s, { rounded: true, backgroundColor: CAT[svc.cat], strokeColor: CAT[svc.cat], fillStyle: 'solid', roughness: 0.4 });
  glyph(b, svc.glyph, x, y, s);
  if (o.full) {
    b.label(svc.name, x + s / 2, y + s + 14, { size: 14, bold: true });
    b.label(svc.role, x + s / 2, y + s + 33, { size: 12, color: GREY });
  } else b.label(o.label ?? svc.short, x + s / 2, y + s + 12, { size: 12 });
  return b;
}

/** Grouping box with a header label (and an optional little badge). */
function group(
  b: ItemBuilder,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  color: string,
  o: { dashed?: boolean; fill?: string; badge?: Glyph } = {},
) {
  b.rect(x, y, w, h, {
    strokeColor: color,
    strokeStyle: o.dashed ? 'dashed' : 'solid',
    backgroundColor: o.fill ?? 'transparent',
    fillStyle: 'solid',
    roughness: 0.4,
    strokeWidth: 1.5,
  });
  let tx = x + 10;
  if (o.badge) {
    b.rect(x, y, 26, 26, { backgroundColor: color, strokeColor: color, fillStyle: 'solid', roughness: 0.3 });
    glyph(b, o.badge, x, y, 26);
    tx = x + 34;
  }
  return b.textMid(title, tx, y + 13, { size: 13, bold: true, color });
}

const arrow = (b: ItemBuilder, pts: Pt[], o: { dashed?: boolean; label?: string; at?: Pt } = {}) => {
  b.arrow(pts, { roughness: 0.5, strokeColor: '#495057', ...(o.dashed ? { strokeStyle: 'dashed' as const } : {}) });
  if (o.label && o.at) b.label(o.label, o.at[0], o.at[1], { size: 11, color: GREY, italic: true });
  return b;
};

const GROUP_COLORS = {
  cloud: '#343a40',
  region: '#0c8599',
  vpc: '#6741d9',
  az: '#1971c2',
  public: '#2f9e44',
  private: '#1971c2',
  sg: '#e03131',
  asg: '#e8590c',
};

// ───────────────────────────── service tiles ─────────────────────────────
const services: BuiltinDef[] = Object.entries(SERVICES).map(([key, svc]) => ({
  id: `aws-${key}`,
  name: svc.name === svc.short ? svc.name : `${svc.name} (${svc.role})`,
  build: (b: ItemBuilder) => tile(b, key, 0, 0, 64, { full: true }),
}));

// ───────────────────────────── groups ─────────────────────────────
const groups: BuiltinDef[] = [
  { id: 'aws-group-cloud', name: 'AWS Cloud (group)', build: (b) => group(b, 0, 0, 520, 340, 'AWS Cloud', GROUP_COLORS.cloud, { badge: 'globe' }) },
  { id: 'aws-group-region', name: 'Region (group)', build: (b) => group(b, 0, 0, 460, 300, 'Region · us-east-1', GROUP_COLORS.region, { dashed: true }) },
  { id: 'aws-group-vpc', name: 'VPC (group)', build: (b) => group(b, 0, 0, 420, 280, 'VPC · 10.0.0.0/16', GROUP_COLORS.vpc, { badge: 'lock' }) },
  { id: 'aws-group-az', name: 'Availability Zone (group)', build: (b) => group(b, 0, 0, 200, 260, 'Availability Zone A', GROUP_COLORS.az, { dashed: true }) },
  { id: 'aws-group-public', name: 'Public subnet (group)', build: (b) => group(b, 0, 0, 180, 110, 'Public subnet', GROUP_COLORS.public, { fill: '#ebfbee' }) },
  { id: 'aws-group-private', name: 'Private subnet (group)', build: (b) => group(b, 0, 0, 180, 110, 'Private subnet', GROUP_COLORS.private, { fill: '#e7f5ff' }) },
  { id: 'aws-group-sg', name: 'Security group (group)', build: (b) => group(b, 0, 0, 160, 100, 'Security group', GROUP_COLORS.sg, { dashed: true }) },
  {
    id: 'aws-group-asg',
    name: 'Auto Scaling group',
    build: (b) => {
      group(b, 0, 0, 260, 120, 'Auto Scaling group', GROUP_COLORS.asg, { dashed: true });
      [20, 106, 192].forEach((x) => tile(b, 'ec2', x, 36, 44));
      return b;
    },
  },
];

// ───────────────────────────── reference architectures ─────────────────────────────
const patterns: BuiltinDef[] = [
  {
    id: 'aws-arch-static-site',
    name: 'Static website (S3 + CloudFront)',
    build: (b) => {
      tile(b, 'users', 0, 30);
      arrow(b, [[56, 54], [120, 54]]);
      tile(b, 'route53', 124, 30);
      arrow(b, [[180, 54], [244, 54]]);
      tile(b, 'cloudfront', 248, 30);
      arrow(b, [[304, 54], [368, 54]], { label: 'origin', at: [336, 42] });
      tile(b, 's3', 372, 30, 48, { label: 'S3 bucket' });
      return group(b, 230, 0, 210, 110, 'AWS Cloud', GROUP_COLORS.cloud, { dashed: true });
    },
  },
  {
    id: 'aws-arch-serverless-api',
    name: 'Serverless API',
    build: (b) => {
      tile(b, 'users', 0, 70);
      arrow(b, [[56, 94], [128, 94]], { label: 'HTTPS', at: [92, 82] });
      group(b, 110, 0, 470, 210, 'AWS Cloud', GROUP_COLORS.cloud, { badge: 'globe' });
      tile(b, 'apigw', 136, 70);
      arrow(b, [[192, 94], [262, 94]]);
      tile(b, 'lambda', 266, 70);
      arrow(b, [[322, 94], [392, 94]]);
      tile(b, 'dynamodb', 396, 70);
      tile(b, 'cognito', 216, 150, 40);
      arrow(b, [[226, 148], [190, 122]], { dashed: true });
      b.label('auth', 196, 148, { size: 11, color: GREY, italic: true });
      tile(b, 'cloudwatch', 500, 150, 40);
      arrow(b, [[318, 120], [496, 168]], { dashed: true });
      return b.label('logs', 420, 160, { size: 11, color: GREY, italic: true });
    },
  },
  {
    id: 'aws-arch-three-tier',
    name: 'Three-tier web app (multi-AZ)',
    build: (b) => {
      tile(b, 'users', 0, 150);
      arrow(b, [[56, 174], [96, 174]]);
      tile(b, 'route53', 100, 150);
      arrow(b, [[156, 174], [196, 174]]);
      tile(b, 'cloudfront', 200, 150);
      arrow(b, [[256, 174], [300, 174]]);
      group(b, 280, 0, 560, 380, 'VPC', GROUP_COLORS.vpc, { badge: 'lock' });
      tile(b, 'elb', 304, 150, 48, { label: 'ALB' });
      ([['A', 40], ['B', 200]] as Array<[string, number]>).forEach(([az, y]) => {
        group(b, 400, y, 420, 150, `Availability Zone ${az}`, GROUP_COLORS.az, { dashed: true });
        group(b, 414, y + 34, 190, 100, 'Private subnet · app', GROUP_COLORS.private, { fill: '#e7f5ff' });
        tile(b, 'ec2', 486, y + 58, 40, { label: 'App server' });
        group(b, 616, y + 34, 190, 100, 'Private subnet · data', GROUP_COLORS.private, { fill: '#e7f5ff' });
        tile(b, 'rds', 690, y + 58, 40, { label: az === 'A' ? 'RDS primary' : 'RDS standby' });
        arrow(b, [[352, 174], [484, y + 78]]);
        arrow(b, [[528, y + 78], [688, y + 78]]);
      });
      arrow(b, [[710, 126], [710, 256]], { dashed: true, label: 'sync replication', at: [762, 182] });
      tile(b, 's3', 200, 290, 40, { label: 'Static assets' });
      return arrow(b, [[228, 206], [220, 288]], { dashed: true });
    },
  },
  {
    id: 'aws-arch-event-driven',
    name: 'Event-driven processing',
    build: (b) => {
      tile(b, 's3', 0, 40, 48, { label: 'Uploads (S3)' });
      arrow(b, [[56, 64], [116, 64]], { label: 'object created', at: [86, 52] });
      tile(b, 'eventbridge', 120, 40);
      arrow(b, [[176, 64], [236, 64]]);
      tile(b, 'sqs', 240, 40);
      arrow(b, [[296, 64], [356, 64]]);
      tile(b, 'lambda', 360, 40, 48, { label: 'Worker' });
      arrow(b, [[416, 64], [476, 64]]);
      tile(b, 'dynamodb', 480, 40);
      arrow(b, [[384, 104], [384, 150]]);
      tile(b, 'sns', 360, 150, 48, { label: 'Notify (SNS)' });
      arrow(b, [[268, 110], [268, 150]], { dashed: true, label: 'failed messages', at: [204, 130] });
      return tile(b, 'sqs', 244, 150, 48, { label: 'Dead-letter queue' });
    },
  },
  {
    id: 'aws-arch-microservices',
    name: 'Microservices on containers',
    build: (b) => {
      tile(b, 'users', 0, 120);
      arrow(b, [[56, 144], [100, 144]]);
      tile(b, 'apigw', 104, 120);
      arrow(b, [[160, 144], [204, 144]]);
      tile(b, 'elb', 208, 120, 48, { label: 'ALB' });
      group(b, 290, 0, 260, 300, 'ECS cluster (Fargate)', CAT.compute, { dashed: true, badge: 'containers' });
      (['Orders', 'Payments', 'Catalog'] as const).forEach((name, i) => {
        const y = 44 + i * 84;
        b.box('rectangle', 320, y, 200, 52, `${name} service`, { rounded: true, backgroundColor: '#fff4e6', strokeColor: CAT.compute, fillStyle: 'solid', roughness: 0.5, size: 14, bold: true });
        arrow(b, [[264, 144], [318, y + 26]]);
      });
      tile(b, 'aurora', 610, 30, 44, { label: 'Aurora' });
      arrow(b, [[520, 70], [606, 52]]);
      tile(b, 'sqs', 610, 120, 44, { label: 'Order events' });
      arrow(b, [[520, 100], [606, 140]], { dashed: true });
      tile(b, 'elasticache', 610, 210, 44, { label: 'Cache' });
      return arrow(b, [[520, 238], [606, 232]]);
    },
  },
  {
    id: 'aws-arch-vpc-layout',
    name: 'VPC network layout',
    build: (b) => {
      tile(b, 'internet', 270, 0, 44);
      group(b, 0, 80, 584, 400, 'VPC · 10.0.0.0/16', GROUP_COLORS.vpc, { badge: 'lock' });
      b.box('rectangle', 232, 96, 120, 32, 'Internet gateway', { rounded: true, backgroundColor: '#e5dbff', strokeColor: GROUP_COLORS.vpc, fillStyle: 'solid', size: 12, bold: true, roughness: 0.4 });
      arrow(b, [[292, 60], [292, 94]]);
      ([['A', 16], ['B', 300]] as Array<[string, number]>).forEach(([az, x]) => {
        group(b, x, 140, 268, 326, `Availability Zone ${az}`, GROUP_COLORS.az, { dashed: true });
        group(b, x + 14, 176, 240, 120, `Public · 10.0.${az === 'A' ? 1 : 2}.0/24`, GROUP_COLORS.public, { fill: '#ebfbee' });
        b.box('rectangle', x + 30, 220, 96, 40, 'NAT gateway', { rounded: true, backgroundColor: '#ffffff', strokeColor: GROUP_COLORS.public, fillStyle: 'solid', size: 12, roughness: 0.4 });
        tile(b, 'elb', x + 168, 214, 40, { label: 'ALB' });
        group(b, x + 14, 316, 240, 136, `Private · 10.0.${az === 'A' ? 3 : 4}.0/24`, GROUP_COLORS.private, { fill: '#e7f5ff' });
        tile(b, 'ec2', x + 168, 356, 40, { label: 'App' });
        tile(b, 'rds', x + 40, 356, 40, { label: 'Database' });
        arrow(b, [[x + 188, 268], [x + 188, 354]]);
        arrow(b, [[x + 166, 376], [x + 82, 376]]);
        arrow(b, [[x + 172, 356], [x + 110, 262]], { dashed: true });
      });
      return b.label('dashed: private apps reach the internet only through the NAT gateway', 292, 494, { size: 11, color: GREY, italic: true });
    },
  },
  {
    id: 'aws-arch-data-lake',
    name: 'Streaming analytics / data lake',
    build: (b) => {
      tile(b, 'users', 0, 40, 48, { label: 'Apps & devices' });
      arrow(b, [[56, 64], [116, 64]], { label: 'events', at: [86, 52] });
      tile(b, 'kinesis', 120, 40);
      arrow(b, [[176, 64], [236, 64]]);
      tile(b, 'lambda', 240, 40, 48, { label: 'Transform' });
      arrow(b, [[296, 64], [356, 64]]);
      tile(b, 's3', 360, 40, 48, { label: 'Data lake (S3)' });
      arrow(b, [[384, 104], [384, 150]]);
      tile(b, 'athena', 360, 150, 48, { label: 'Ad-hoc SQL' });
      arrow(b, [[416, 64], [476, 64]]);
      tile(b, 'redshift', 480, 40, 48, { label: 'Warehouse' });
      arrow(b, [[504, 104], [504, 150]]);
      b.box('rectangle', 456, 150, 100, 48, 'Dashboards', { rounded: true, backgroundColor: '#e3fafc', strokeColor: CAT.analytics, fillStyle: 'solid', size: 13, bold: true, roughness: 0.5 });
      arrow(b, [[416, 174], [454, 174]]);
      tile(b, 'sagemaker', 600, 40, 48, { label: 'ML models' });
      return arrow(b, [[536, 64], [596, 64]], { dashed: true });
    },
  },
  {
    id: 'aws-arch-multi-region',
    name: 'Multi-region failover',
    build: (b) => {
      tile(b, 'users', 250, 0);
      arrow(b, [[274, 64], [274, 86]]);
      tile(b, 'route53', 250, 90, 48, { label: 'Route 53 · failover' });
      ([['Region A · primary', 0, 'active'], ['Region B · standby', 330, 'passive']] as Array<[string, number, string]>).forEach(([name, x, mode]) => {
        group(b, x, 180, 300, 200, name, GROUP_COLORS.region, { dashed: true });
        tile(b, 'elb', x + 24, 236, 44, { label: 'ALB' });
        tile(b, 'ecs', x + 128, 236, 44, { label: 'App' });
        tile(b, 'aurora', x + 228, 236, 44, { label: mode === 'active' ? 'Aurora (writer)' : 'Aurora (reader)' });
        arrow(b, [[x + 70, 258], [x + 126, 258]]);
        arrow(b, [[x + 174, 258], [x + 226, 258]]);
        arrow(b, [[274, 160], [x + 46, 232]], mode === 'passive' ? { dashed: true } : {});
      });
      arrow(b, [[250, 296], [250, 340], [580, 340], [580, 300]], { dashed: true, label: 'global database replication', at: [415, 354] });
      return b.label('health check fails → traffic moves to Region B', 274, 400, { size: 12, color: GREY, italic: true });
    },
  },
];

export const AWS_SECTIONS: Array<{ name: string; items: BuiltinDef[] }> = [
  { name: 'AWS services', items: services },
  { name: 'AWS groups', items: groups },
  { name: 'AWS architectures', items: patterns },
];
