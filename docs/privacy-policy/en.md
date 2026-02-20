# Privacy Policy - Lexato Chrome Extension

**Effective date:** February 10, 2026
**Last updated:** February 10, 2026
**Version:** 1.0.0

---

## 1. Introduction

This Privacy Policy describes how the **Lexato - Digital Evidence Registry** Chrome extension ("Extension") collects, uses, stores, and protects its users' data.

**Data controller:**
Lexato Tecnologia Ltda.
Email: privacidade@lexato.com.br
Website: https://lexato.com.br

The Extension is a digital evidence capture and certification tool with legal validity, developed in compliance with the **Brazilian General Data Protection Law (LGPD - Law 13,709/2018)**, the **EU General Data Protection Regulation (GDPR)**, and the **ISO/IEC 27037** standard for identification, collection, acquisition, and preservation of digital evidence.

Use of the Extension implies knowledge and acceptance of this Privacy Policy. We recommend reading this document in full before using our services.

---

## 2. Data Collected

### 2.1 Data actively collected during captures

The Extension collects the following data **exclusively when the user explicitly initiates a digital evidence capture**:

- **Screenshots**: Screen images captured by the user
- **Videos**: Browsing recordings made by the user
- **Forensic metadata**:
  - URL of the captured page
  - Page title
  - Timestamp (exact date and time of capture, with timezone)
  - User's IP address
  - Geolocation (when authorized by the user)
  - Reverse DNS of the captured page's server
  - WHOIS information of the captured domain
  - Wayback Machine (Internet Archive) record of the page
- **URLs visited during video capture**: Forensic browsing log recorded only during active video recordings

### 2.2 Authentication data

- **OAuth2 tokens**: Authentication tokens obtained via Supabase (auth.lexato.com.br) for user identification and access to platform services

### 2.3 Optional data (collected only with explicit permission)

- **List of installed extensions**: Collected only when the user grants the `management` permission, used for extension isolation during captures (forensic integrity assurance)
- **Geolocation**: Collected only when the user grants the `geolocation` permission, used as a complementary forensic metadata

### 2.4 Data NOT collected

The Extension does **NOT** collect, under any circumstances:

- Browsing history outside of active captures
- Cookies or session data from visited websites
- Form data filled in by the user
- Passwords or access credentials for other services
- Financial data (credit card numbers, banking information)

---

## 3. Purpose of Processing

| Data | Purpose | Legal Basis (LGPD / GDPR) |
|------|---------|--------------------------|
| Screenshots and videos | Constitution of digital evidence with legal validity | Performance of contract (LGPD Art. 7, V / GDPR Art. 6(1)(b)) |
| Forensic metadata (URL, title, timestamp) | Chain of custody assurance and evidence authenticity | Performance of contract (LGPD Art. 7, V / GDPR Art. 6(1)(b)) |
| IP address | Identification of capture origin for forensic purposes | Legitimate interest (LGPD Art. 7, IX / GDPR Art. 6(1)(f)) |
| Geolocation | Complementary forensic metadata for capture location | Consent (LGPD Art. 7, I / GDPR Art. 6(1)(a)) |
| Reverse DNS and WHOIS | Verification of captured server and domain identity | Performance of contract (LGPD Art. 7, V / GDPR Art. 6(1)(b)) |
| Wayback Machine | Historical page record for temporal comparison | Performance of contract (LGPD Art. 7, V / GDPR Art. 6(1)(b)) |
| URLs during video capture | Forensic browsing log for recording integrity | Performance of contract (LGPD Art. 7, V / GDPR Art. 6(1)(b)) |
| OAuth2 tokens | User authentication and identification on the platform | Performance of contract (LGPD Art. 7, V / GDPR Art. 6(1)(b)) |
| List of installed extensions | Extension isolation during capture (forensic integrity) | Consent (LGPD Art. 7, I / GDPR Art. 6(1)(a)) |

---

## 4. How Data is Processed

Data captured by the Extension undergoes the following processing flow to ensure integrity and legal validity:

1. **SHA-256 Hashing**: Each captured piece of evidence receives a SHA-256 cryptographic hash that guarantees content integrity. Any modification to the file invalidates the hash.

2. **Merkle Tree Organization**: Individual hashes are organized into a Merkle Tree structure, enabling efficient integrity verification of evidence sets.

3. **Blockchain Certification**: The Merkle Tree root hash is recorded on public blockchain networks (Polygon, Arbitrum, or Optimism), creating an immutable and verifiable record of the evidence's existence at a specific point in time.

4. **Storage**:
   - **Database**: Supabase (PostgreSQL) hosted on managed infrastructure, accessed via custom domain auth.lexato.com.br
   - **Files**: AWS S3 in the sa-east-1 region (Sao Paulo, Brazil), ensuring data remains within Brazilian territory

---

## 5. Sharing with Third Parties

The Extension shares data with the following third parties, exclusively for the purposes described:

| Third Party | Purpose | Data Shared | Location |
|-------------|---------|-------------|----------|
| **Supabase** | Authentication and database | OAuth2 tokens, evidence metadata | Via custom domain *.lexato.com.br |
| **AWS S3** | Evidence file storage | Screenshots, videos, certificates | sa-east-1 (Sao Paulo, Brazil) |
| **Sentry** | Error monitoring and stability | Technical error data (no personal capture data) | USA |
| **ipinfo.io** | User public IP address identification | IP address (for capture forensic metadata) | USA |
| **Blockchain Networks** (Polygon, Arbitrum, Optimism) | Immutable evidence certification | Cryptographic hashes only (no personally identifiable data) | Decentralized |

**Important**: Hashes recorded on blockchain are public and immutable, but do not contain personally identifiable data - they are only cryptographic digests that allow verification of evidence integrity.

---

## 6. Extension Permissions

### 6.1 Required permissions

| Permission | Technical Justification | When Used |
|------------|------------------------|-----------|
| `host_permissions` (https://*/* and http://*/*) | Access to any web page for screenshot capture and lockdown script injection | Only when the user explicitly initiates a capture |
| `storage` | Local storage of authentication tokens and user settings | Continuously, to maintain the session |
| `tabs` | Obtaining tab URL and title for forensic metadata | During the capture process |
| `scripting` | Dynamic script injection for DevTools lockdown during capture (forensic integrity preservation) | During the capture process |
| `alarms` | Scheduling automatic authentication token refresh and status polling | Continuously, in the background |
| `webNavigation` | Monitoring navigations during video capture for forensic log | Only during video recording |
| `offscreen` | Creating offscreen document for DOM API access (e.g., geolocation) in Manifest V3 | When DOM APIs are needed |
| `sidePanel` | Displaying video recording controls outside the captured area, allowing navigation without interfering with the video | During video recording |
| `identity` | User OAuth2 authentication with the identity provider | During login and session refresh |

### 6.2 Optional permissions (requested on demand)

| Permission | Technical Justification | When Requested |
|------------|------------------------|----------------|
| `management` | Extension management for isolation during capture (temporarily disables other extensions to ensure forensic integrity) | When the user activates isolation mode |
| `geolocation` | Collection of geographic coordinates as complementary forensic metadata | When the user opts to include geolocation in the capture |
| `notifications` | Capture status and blockchain certification notifications | When the user activates notifications |
| `tabCapture` | Active tab video stream capture for recording | When the user initiates a video recording |

---

## 7. Legal Compliance

### 7.1 ISO/IEC 27037

The Extension was developed in compliance with the ISO/IEC 27037 standard, which establishes guidelines for identification, collection, acquisition, and preservation of digital evidence. The capture, hashing, certification, and storage processes follow international best practices to ensure the admissibility of evidence in legal proceedings.

### 7.2 LGPD (Law 13,709/2018)

The processing of personal data by the Extension is supported by the following legal bases under the LGPD:

- **Performance of contract** (Art. 7, V): For data necessary to provide the digital evidence capture and certification service
- **Consent** (Art. 7, I): For optional data such as geolocation and list of installed extensions
- **Legitimate interest** (Art. 7, IX): For IP address collection as forensic metadata

### 7.3 GDPR (Regulation (EU) 2016/679)

For users in the European Economic Area, the processing of personal data is additionally supported by the following legal bases under the GDPR:

- **Performance of contract** (Art. 6(1)(b)): For data necessary to provide the contracted service
- **Consent** (Art. 6(1)(a)): For optional data processing
- **Legitimate interest** (Art. 6(1)(f)): For IP address collection as forensic metadata

### 7.4 Data Subject Rights

Under Article 18 of the LGPD and Articles 15-22 of the GDPR, data subjects have the right to:

- Confirmation of the existence of processing
- Access to personal data
- Correction of incomplete, inaccurate, or outdated data
- Anonymization, blocking, or deletion of unnecessary or excessive data
- Data portability
- Deletion of personal data processed with consent
- Information about data sharing with third parties
- Information about the possibility of not providing consent and its consequences
- Withdrawal of consent

To exercise any of these rights, contact us at: **privacidade@lexato.com.br**

The response deadline is up to **15 business days**, as established by the LGPD.

---

## 8. Data Retention and Deletion

### 8.1 Retention period

- **Digital evidence** (screenshots, videos, metadata): Stored for the period contracted by the user, according to the service plan
- **Authentication tokens**: Stored locally in the browser while the session is active
- **User settings**: Stored locally until the Extension is uninstalled or manually cleared

### 8.2 Data deletion

Users may request the deletion of their personal data at any time by emailing privacidade@lexato.com.br.

**Exception**: Hashes recorded on blockchain are immutable by nature and cannot be deleted. However, these hashes do not contain personally identifiable data.

### 8.3 Uninstallation

When uninstalling the Extension, all locally stored data (tokens, settings) is automatically removed by the browser. Data stored on Lexato servers remains available according to the contracted retention period.

---

## 9. Consent

The Extension obtains explicit consent from the user before each digital evidence capture. The user must actively initiate the capture process (screenshot or video) for any data collection to occur.

Optional permissions (geolocation, extension management, notifications, video capture) are requested individually when the corresponding functionality is needed, and the user may decline without prejudice to other functionalities.

---

## 10. Security

The Extension adopts the following security measures:

- **Data stored in Brazil**: Evidence files on AWS S3 region sa-east-1 (Sao Paulo)
- **Encryption in transit**: All communications use HTTPS/TLS and WSS (WebSocket Secure)
- **Cryptographic hashing**: SHA-256 for evidence integrity assurance
- **Blockchain certification**: Immutable and verifiable record on public networks
- **Custom domain**: Authentication via auth.lexato.com.br (no third-party domain exposure)
- **Restrictive Content Security Policy**: The Extension implements strict CSP limiting script and connection origins

---

## 11. Changes to this Policy

This Privacy Policy may be updated periodically to reflect changes in our services or applicable legislation.

In case of significant changes, users will be notified at least **30 days** in advance before the changes take effect.

The most recent version will always be available at: https://lexato.com.br/privacy-policy

---

## 12. Contact

For questions, requests, or complaints related to this Privacy Policy or the processing of personal data:

**Data Protection Officer (DPO):**
Email: privacidade@lexato.com.br
Website: https://lexato.com.br
