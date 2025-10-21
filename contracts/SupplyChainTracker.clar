(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-PRODUCT-ID u101)
(define-constant ERR-INVALID-STAGE u102)
(define-constant ERR-INVALID-TIMESTAMP u103)
(define-constant ERR-INVALID-LOCATION u104)
(define-constant ERR-INVALID-STATUS u105)
(define-constant ERR-PRODUCT-NOT-FOUND u106)
(define-constant ERR-STAGE-ALREADY-EXISTS u107)
(define-constant ERR-INVALID-UPDATED-BY u108)
(define-constant ERR-INVALID-HASH u109)
(define-constant ERR-MAX-STAGES-EXCEEDED u110)
(define-constant ERR-INVALID-DESCRIPTION u111)
(define-constant ERR-INVALID-QUANTITY u112)
(define-constant ERR-INVALID-CERTIFICATION u113)
(define-constant ERR-INVALID-VERIFIER u114)
(define-constant ERR-PRODUCT-ALREADY-FINALIZED u115)
(define-constant ERR-INVALID-AUDIT-REQUEST u116)
(define-constant ERR-AUDIT-ALREADY_PERFORMED u117)
(define-constant ERR-INVALID-METADATA u118)
(define-constant ERR-INVALID-OWNER u119)
(define-constant ERR-TRANSFER-NOT-ALLOWED u120)

(define-data-var next-stage-id uint u0)
(define-data-var max-stages-per-product uint u50)
(define-data-var audit-fee uint u500)
(define-data-var authority-contract (optional principal) none)

(define-map products
  uint
  {
    owner: principal,
    hash: (buff 32),
    description: (string-utf8 256),
    quantity: uint,
    certification: (string-utf8 100),
    status: bool,
    finalized: bool,
    timestamp: uint
  }
)

(define-map stages
  { product-id: uint, stage-id: uint }
  {
    stage-name: (string-utf8 100),
    location: (string-utf8 100),
    timestamp: uint,
    updated-by: principal,
    metadata: (string-utf8 512)
  }
)

(define-map product-stages-count uint uint)

(define-map audits
  { product-id: uint, audit-id: uint }
  {
    verifier: principal,
    timestamp: uint,
    findings: (string-utf8 512),
    passed: bool
  }
)

(define-map product-audits-count uint uint)

(define-read-only (get-product (id uint))
  (map-get? products id)
)

(define-read-only (get-stage (product-id uint) (stage-id uint))
  (map-get? stages { product-id: product-id, stage-id: stage-id })
)

(define-read-only (get-audit (product-id uint) (audit-id uint))
  (map-get? audits { product-id: product-id, audit-id: audit-id })
)

(define-read-only (get-product-stages-count (id uint))
  (default-to u0 (map-get? product-stages-count id))
)

(define-read-only (get-product-audits-count (id uint))
  (default-to u0 (map-get? product-audits-count id))
)

(define-private (validate-product-id (id uint))
  (if (> id u0) (ok true) (err ERR-INVALID-PRODUCT-ID))
)

(define-private (validate-stage-name (name (string-utf8 100)))
  (if (and (> (len name) u0) (<= (len name) u100)) (ok true) (err ERR-INVALID-STAGE))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100)) (ok true) (err ERR-INVALID-LOCATION))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height) (ok true) (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-hash (h (buff 32)))
  (if (is-eq (len h) u32) (ok true) (err ERR-INVALID-HASH))
)

(define-private (validate-description (desc (string-utf8 256)))
  (if (<= (len desc) u256) (ok true) (err ERR-INVALID-DESCRIPTION))
)

(define-private (validate-quantity (q uint))
  (if (> q u0) (ok true) (err ERR-INVALID-QUANTITY))
)

(define-private (validate-certification (cert (string-utf8 100)))
  (if (<= (len cert) u100) (ok true) (err ERR-INVALID-CERTIFICATION))
)

(define-private (validate-verifier (v principal))
  (if (not (is-eq v tx-sender)) (ok true) (err ERR-INVALID-VERIFIER))
)

(define-private (validate-metadata (meta (string-utf8 512)))
  (if (<= (len meta) u512) (ok true) (err ERR-INVALID-METADATA))
)

(define-private (validate-owner (o principal))
  (if (not (is-eq o 'SP000000000000000000002Q6VF78)) (ok true) (err ERR-INVALID-OWNER))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-owner contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-stages (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-STAGE))
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set max-stages-per-product new-max)
    (ok true)
  )
)

(define-public (set-audit-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-QUANTITY))
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set audit-fee new-fee)
    (ok true)
  )
)

(define-public (initialize-product
  (product-id uint)
  (hash (buff 32))
  (description (string-utf8 256))
  (quantity uint)
  (certification (string-utf8 100))
)
  (begin
    (try! (validate-product-id product-id))
    (try! (validate-hash hash))
    (try! (validate-description description))
    (try! (validate-quantity quantity))
    (try! (validate-certification certification))
    (asserts! (is-none (map-get? products product-id)) (err ERR-STAGE-ALREADY-EXISTS))
    (map-set products product-id
      {
        owner: tx-sender,
        hash: hash,
        description: description,
        quantity: quantity,
        certification: certification,
        status: true,
        finalized: false,
        timestamp: block-height
      }
    )
    (map-set product-stages-count product-id u0)
    (map-set product-audits-count product-id u0)
    (print { event: "product-initialized", id: product-id })
    (ok true)
  )
)

(define-public (add-stage
  (product-id uint)
  (stage-name (string-utf8 100))
  (location (string-utf8 100))
  (metadata (string-utf8 512))
)
  (let (
    (product (unwrap! (map-get? products product-id) (err ERR-PRODUCT-NOT-FOUND)))
    (stage-count (get-product-stages-count product-id))
    (max-stages (var-get max-stages-per-product))
  )
    (asserts! (is-eq (get owner product) tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (get finalized product)) (err ERR-PRODUCT-ALREADY-FINALIZED))
    (asserts! (< stage-count max-stages) (err ERR-MAX-STAGES-EXCEEDED))
    (try! (validate-stage-name stage-name))
    (try! (validate-location location))
    (try! (validate-metadata metadata))
    (let ((new-stage-id (+ stage-count u1)))
      (map-set stages { product-id: product-id, stage-id: new-stage-id }
        {
          stage-name: stage-name,
          location: location,
          timestamp: block-height,
          updated-by: tx-sender,
          metadata: metadata
        }
      )
      (map-set product-stages-count product-id new-stage-id)
      (print { event: "stage-added", product-id: product-id, stage-id: new-stage-id })
      (ok new-stage-id)
    )
  )
)

(define-public (perform-audit
  (product-id uint)
  (findings (string-utf8 512))
  (passed bool)
)
  (let (
    (product (unwrap! (map-get? products product-id) (err ERR-PRODUCT-NOT-FOUND)))
    (audit-count (get-product-audits-count product-id))
    (authority (unwrap! (var-get authority-contract) (err ERR-NOT-AUTHORIZED)))
  )
    (asserts! (not (is-eq tx-sender (get owner product))) (err ERR-NOT-AUTHORIZED))
    (try! (validate-metadata findings))
    (try! (stx-transfer? (var-get audit-fee) tx-sender authority))
    (let ((new-audit-id (+ audit-count u1)))
      (map-set audits { product-id: product-id, audit-id: new-audit-id }
        {
          verifier: tx-sender,
          timestamp: block-height,
          findings: findings,
          passed: passed
        }
      )
      (map-set product-audits-count product-id new-audit-id)
      (print { event: "audit-performed", product-id: product-id, audit-id: new-audit-id })
      (ok new-audit-id)
    )
  )
)

(define-public (finalize-product (product-id uint))
  (let ((product (unwrap! (map-get? products product-id) (err ERR-PRODUCT-NOT-FOUND))))
    (asserts! (is-eq (get owner product) tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (get finalized product)) (err ERR-PRODUCT-ALREADY-FINALIZED))
    (map-set products product-id (merge product { finalized: true }))
    (print { event: "product-finalized", id: product-id })
    (ok true)
  )
)

(define-public (transfer-ownership (product-id uint) (new-owner principal))
  (let ((product (unwrap! (map-get? products product-id) (err ERR-PRODUCT-NOT-FOUND))))
    (asserts! (is-eq (get owner product) tx-sender) (err ERR-NOT-AUTHORIZED))
    (try! (validate-owner new-owner))
    (asserts! (not (get finalized product)) (err ERR-TRANSFER-NOT-ALLOWED))
    (map-set products product-id (merge product { owner: new-owner }))
    (print { event: "ownership-transferred", id: product-id, new-owner: new-owner })
    (ok true)
  )
)