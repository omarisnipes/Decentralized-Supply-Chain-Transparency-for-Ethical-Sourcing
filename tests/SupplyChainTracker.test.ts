import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, stringUtf8CV, buffCV, principalCV, boolCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_PRODUCT_ID = 101;
const ERR_INVALID_STAGE = 102;
const ERR_INVALID_TIMESTAMP = 103;
const ERR_INVALID_LOCATION = 104;
const ERR_INVALID_STATUS = 105;
const ERR_PRODUCT_NOT_FOUND = 106;
const ERR_STAGE_ALREADY_EXISTS = 107;
const ERR_INVALID_UPDATED_BY = 108;
const ERR_INVALID_HASH = 109;
const ERR_MAX_STAGES_EXCEEDED = 110;
const ERR_INVALID_DESCRIPTION = 111;
const ERR_INVALID_QUANTITY = 112;
const ERR_INVALID_CERTIFICATION = 113;
const ERR_INVALID_VERIFIER = 114;
const ERR_PRODUCT_ALREADY_FINALIZED = 115;
const ERR_INVALID_AUDIT_REQUEST = 116;
const ERR_AUDIT_ALREADY_PERFORMED = 117;
const ERR_INVALID_METADATA = 118;
const ERR_INVALID_OWNER = 119;
const ERR_TRANSFER_NOT_ALLOWED = 120;

interface Product {
  owner: string;
  hash: Uint8Array;
  description: string;
  quantity: number;
  certification: string;
  status: boolean;
  finalized: boolean;
  timestamp: number;
}

interface Stage {
  stageName: string;
  location: string;
  timestamp: number;
  updatedBy: string;
  metadata: string;
}

interface Audit {
  verifier: string;
  timestamp: number;
  findings: string;
  passed: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class SupplyChainTrackerMock {
  state: {
    nextStageId: number;
    maxStagesPerProduct: number;
    auditFee: number;
    authorityContract: string | null;
    products: Map<number, Product>;
    stages: Map<string, Stage>;
    productStagesCount: Map<number, number>;
    audits: Map<string, Audit>;
    productAuditsCount: Map<number, number>;
  } = {
    nextStageId: 0,
    maxStagesPerProduct: 50,
    auditFee: 500,
    authorityContract: null,
    products: new Map(),
    stages: new Map(),
    productStagesCount: new Map(),
    audits: new Map(),
    productAuditsCount: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextStageId: 0,
      maxStagesPerProduct: 50,
      auditFee: 500,
      authorityContract: null,
      products: new Map(),
      stages: new Map(),
      productStagesCount: new Map(),
      audits: new Map(),
      productAuditsCount: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: ERR_INVALID_OWNER };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxStages(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: ERR_INVALID_STAGE };
    if (!this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.maxStagesPerProduct = newMax;
    return { ok: true, value: true };
  }

  setAuditFee(newFee: number): Result<boolean> {
    if (newFee < 0) return { ok: false, value: ERR_INVALID_QUANTITY };
    if (!this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.auditFee = newFee;
    return { ok: true, value: true };
  }

  initializeProduct(
    productId: number,
    hash: Uint8Array,
    description: string,
    quantity: number,
    certification: string
  ): Result<boolean> {
    if (productId <= 0) return { ok: false, value: ERR_INVALID_PRODUCT_ID };
    if (hash.length !== 32) return { ok: false, value: ERR_INVALID_HASH };
    if (description.length > 256) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (quantity <= 0) return { ok: false, value: ERR_INVALID_QUANTITY };
    if (certification.length > 100) return { ok: false, value: ERR_INVALID_CERTIFICATION };
    if (this.state.products.has(productId)) return { ok: false, value: ERR_STAGE_ALREADY_EXISTS };
    this.state.products.set(productId, {
      owner: this.caller,
      hash,
      description,
      quantity,
      certification,
      status: true,
      finalized: false,
      timestamp: this.blockHeight,
    });
    this.state.productStagesCount.set(productId, 0);
    this.state.productAuditsCount.set(productId, 0);
    return { ok: true, value: true };
  }

  addStage(
    productId: number,
    stageName: string,
    location: string,
    metadata: string
  ): Result<number> {
    const product = this.state.products.get(productId);
    if (!product) return { ok: false, value: ERR_PRODUCT_NOT_FOUND };
    if (product.owner !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (product.finalized) return { ok: false, value: ERR_PRODUCT_ALREADY_FINALIZED };
    const stageCount = this.state.productStagesCount.get(productId) || 0;
    if (stageCount >= this.state.maxStagesPerProduct) return { ok: false, value: ERR_MAX_STAGES_EXCEEDED };
    if (!stageName || stageName.length > 100) return { ok: false, value: ERR_INVALID_STAGE };
    if (!location || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (metadata.length > 512) return { ok: false, value: ERR_INVALID_METADATA };
    const newStageId = stageCount + 1;
    this.state.stages.set(`${productId}-${newStageId}`, {
      stageName,
      location,
      timestamp: this.blockHeight,
      updatedBy: this.caller,
      metadata,
    });
    this.state.productStagesCount.set(productId, newStageId);
    return { ok: true, value: newStageId };
  }

  performAudit(
    productId: number,
    findings: string,
    passed: boolean
  ): Result<number> {
    const product = this.state.products.get(productId);
    if (!product) return { ok: false, value: ERR_PRODUCT_NOT_FOUND };
    if (this.caller === product.owner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (findings.length > 512) return { ok: false, value: ERR_INVALID_METADATA };
    if (!this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.stxTransfers.push({ amount: this.state.auditFee, from: this.caller, to: this.state.authorityContract });
    const auditCount = this.state.productAuditsCount.get(productId) || 0;
    const newAuditId = auditCount + 1;
    this.state.audits.set(`${productId}-${newAuditId}`, {
      verifier: this.caller,
      timestamp: this.blockHeight,
      findings,
      passed,
    });
    this.state.productAuditsCount.set(productId, newAuditId);
    return { ok: true, value: newAuditId };
  }

  finalizeProduct(productId: number): Result<boolean> {
    const product = this.state.products.get(productId);
    if (!product) return { ok: false, value: ERR_PRODUCT_NOT_FOUND };
    if (product.owner !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (product.finalized) return { ok: false, value: ERR_PRODUCT_ALREADY_FINALIZED };
    this.state.products.set(productId, { ...product, finalized: true });
    return { ok: true, value: true };
  }

  transferOwnership(productId: number, newOwner: string): Result<boolean> {
    const product = this.state.products.get(productId);
    if (!product) return { ok: false, value: ERR_PRODUCT_NOT_FOUND };
    if (product.owner !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newOwner === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_OWNER };
    if (product.finalized) return { ok: false, value: ERR_TRANSFER_NOT_ALLOWED };
    this.state.products.set(productId, { ...product, owner: newOwner });
    return { ok: true, value: true };
  }

  getProduct(productId: number): Product | null {
    return this.state.products.get(productId) || null;
  }

  getStage(productId: number, stageId: number): Stage | null {
    return this.state.stages.get(`${productId}-${stageId}`) || null;
  }

  getAudit(productId: number, auditId: number): Audit | null {
    return this.state.audits.get(`${productId}-${auditId}`) || null;
  }
}

describe("SupplyChainTracker", () => {
  let contract: SupplyChainTrackerMock;

  beforeEach(() => {
    contract = new SupplyChainTrackerMock();
    contract.reset();
  });

  it("initializes a product successfully", () => {
    const hash = new Uint8Array(32).fill(1);
    const result = contract.initializeProduct(1, hash, "Coffee Beans", 1000, "Fair Trade");
    expect(result.ok).toBe(true);
    const product = contract.getProduct(1);
    expect(product?.description).toBe("Coffee Beans");
    expect(product?.quantity).toBe(1000);
    expect(product?.certification).toBe("Fair Trade");
  });

  it("adds a stage successfully", () => {
    const hash = new Uint8Array(32).fill(1);
    contract.initializeProduct(1, hash, "Coffee Beans", 1000, "Fair Trade");
    const result = contract.addStage(1, "Harvesting", "Ethiopia", "Organic methods used");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    const stage = contract.getStage(1, 1);
    expect(stage?.stageName).toBe("Harvesting");
    expect(stage?.location).toBe("Ethiopia");
  });

  it("performs an audit successfully", () => {
    const hash = new Uint8Array(32).fill(1);
    contract.initializeProduct(1, hash, "Coffee Beans", 1000, "Fair Trade");
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST3AUDITOR";
    const result = contract.performAudit(1, "All good", true);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    const audit = contract.getAudit(1, 1);
    expect(audit?.findings).toBe("All good");
    expect(audit?.passed).toBe(true);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST3AUDITOR", to: "ST2TEST" }]);
  });

  it("finalizes a product successfully", () => {
    const hash = new Uint8Array(32).fill(1);
    contract.initializeProduct(1, hash, "Coffee Beans", 1000, "Fair Trade");
    const result = contract.finalizeProduct(1);
    expect(result.ok).toBe(true);
    const product = contract.getProduct(1);
    expect(product?.finalized).toBe(true);
  });

  it("transfers ownership successfully", () => {
    const hash = new Uint8Array(32).fill(1);
    contract.initializeProduct(1, hash, "Coffee Beans", 1000, "Fair Trade");
    const result = contract.transferOwnership(1, "ST4NEWOWNER");
    expect(result.ok).toBe(true);
    const product = contract.getProduct(1);
    expect(product?.owner).toBe("ST4NEWOWNER");
  });

  it("rejects invalid product initialization", () => {
    const hash = new Uint8Array(31).fill(1);
    const result = contract.initializeProduct(1, hash, "Coffee Beans", 1000, "Fair Trade");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH);
  });

  it("rejects adding stage to non-existent product", () => {
    const result = contract.addStage(99, "Harvesting", "Ethiopia", "Organic");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PRODUCT_NOT_FOUND);
  });

  it("rejects audit without authority", () => {
    const hash = new Uint8Array(32).fill(1);
    contract.initializeProduct(1, hash, "Coffee Beans", 1000, "Fair Trade");
    contract.caller = "ST3AUDITOR";
    const result = contract.performAudit(1, "All good", true);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects finalize by non-owner", () => {
    const hash = new Uint8Array(32).fill(1);
    contract.initializeProduct(1, hash, "Coffee Beans", 1000, "Fair Trade");
    contract.caller = "ST5FAKE";
    const result = contract.finalizeProduct(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects transfer to invalid owner", () => {
    const hash = new Uint8Array(32).fill(1);
    contract.initializeProduct(1, hash, "Coffee Beans", 1000, "Fair Trade");
    const result = contract.transferOwnership(1, "SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_OWNER);
  });

  it("sets audit fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setAuditFee(1000);
    expect(result.ok).toBe(true);
    expect(contract.state.auditFee).toBe(1000);
  });
});