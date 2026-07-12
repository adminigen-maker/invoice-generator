import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

/**
 * Invoice / quotation PDF — matches the client's Odoo-style "TAX Invoice"
 * template (DIA layout): company block top-right, bill-to left, large title,
 * 6-column line table, Untaxed Amount + Total, signature line, and the
 * phone/WhatsApp/email/website footer.
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingBottom: 56,
    paddingHorizontal: 30,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#111827",
    lineHeight: 1.35,
  },

  // Header
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 130, maxHeight: 60, objectFit: "contain" },
  companyBlock: { alignItems: "flex-end", textAlign: "right" },
  companyName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  trn: { marginTop: 6, fontFamily: "Helvetica-Bold" },

  // Bill-to + title
  midRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 34 },
  billTo: { maxWidth: 260 },
  billName: { fontFamily: "Helvetica-Bold" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },

  // Meta
  metaRow: { flexDirection: "row", marginTop: 22, borderTopWidth: 1, borderColor: "#111827", paddingTop: 8 },
  metaCol: { flex: 1 },
  metaLabel: { fontFamily: "Helvetica-Bold", marginBottom: 2 },

  // Table
  table: { marginTop: 18 },
  thead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#111827",
    paddingBottom: 5,
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#e5e7eb", paddingVertical: 5 },
  colDesc: { flex: 34 },
  colQty: { flex: 14, textAlign: "right" },
  colPrice: { flex: 12, textAlign: "right" },
  colVat: { flex: 8, textAlign: "right" },
  colVatAmt: { flex: 14, textAlign: "right" },
  colAmount: { flex: 15, textAlign: "right" },

  // Totals
  bottomRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  payBlock: { maxWidth: 300, fontSize: 8.5, color: "#374151" },
  totalsBlock: { width: 230 },
  totalLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grandLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderColor: "#111827",
    marginTop: 3,
    paddingTop: 4,
  },
  grandText: { fontFamily: "Helvetica-Bold", fontSize: 11 },

  // Signature
  signRow: { flexDirection: "row", marginTop: 42, fontSize: 9 },
  signCell: { flex: 1 },

  // Footer
  footer: {
    position: "absolute",
    bottom: 22,
    left: 30,
    right: 30,
    textAlign: "center",
    fontSize: 8,
    color: "#4b5563",
  },
  footerLink: { color: "#2563eb" },
  bold: { fontFamily: "Helvetica-Bold" },
});

export type DocLine = {
  description: string;
  quantity: number;
  uom: string;
  unit_price: number;
  tax_label: string;
  tax_amount: number;
  amount: number;
};

export type DocumentPdfProps = {
  documentTitle: string;
  documentNumber: string;
  documentDate: string;
  dueDate?: string;
  source?: string;
  paymentTerms?: string;
  paymentCommunication?: string;
  company: {
    name: string;
    addressLine1?: string;
    cityCountry?: string;
    trn?: string;
    phone?: string;
    whatsapp?: string;
    email?: string;
    website?: string;
    bankAccount?: string;
    logoUrl?: string;
  };
  customer: { name: string; addressLines: string[]; trn?: string };
  currency: string;
  lines: DocLine[];
  totals: { untaxed: number; tax: number; total: number };
  showTax?: boolean;
  showPrices?: boolean; // false for delivery notes (goods issue, no money columns)
};

const num = (n: number) => Number(n || 0).toFixed(2);
const money = (n: number, cur: string) => `${cur} ${num(n)}`;

function fmtDate(s?: string): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function DocumentPdf(p: DocumentPdfProps) {
  const showPrices = p.showPrices ?? true;
  const showTax = (p.showTax ?? true) && showPrices;
  const c = p.company;
  const descStyle = showPrices ? styles.colDesc : { flex: 72 };
  const qtyStyle = showPrices ? styles.colQty : { flex: 20, textAlign: "right" as const };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header: optional logo left, company block right */}
        <View style={styles.headerRow}>
          <View>{c.logoUrl ? <Image src={c.logoUrl} style={styles.logo} /> : <Text> </Text>}</View>
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{c.name}</Text>
            {c.addressLine1 ? <Text>{c.addressLine1}</Text> : null}
            {c.cityCountry ? <Text>{c.cityCountry}</Text> : null}
            {c.trn ? <Text style={styles.trn}>TRN: {c.trn}</Text> : null}
          </View>
        </View>

        {/* Bill-to (left) + big title (right) */}
        <View style={styles.midRow}>
          <View style={styles.billTo}>
            <Text style={styles.billName}>{p.customer.name}</Text>
            {p.customer.addressLines.filter(Boolean).map((l, i) => (
              <Text key={i}>{l}</Text>
            ))}
            {p.customer.trn ? <Text>TRN: {p.customer.trn}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.title}>
              {p.documentTitle} {p.documentNumber}
            </Text>
          </View>
        </View>

        {/* Meta row */}
        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>{p.dueDate ? "Invoice Date" : "Date"}</Text>
            <Text>{fmtDate(p.documentDate)}</Text>
          </View>
          {p.dueDate ? (
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>Due Date</Text>
              <Text>{fmtDate(p.dueDate)}</Text>
            </View>
          ) : (
            <View style={styles.metaCol} />
          )}
          {p.source ? (
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>Source</Text>
              <Text>{p.source}</Text>
            </View>
          ) : (
            <View style={styles.metaCol} />
          )}
        </View>

        {/* Line items table */}
        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={[styles.th, descStyle]}>DESCRIPTION</Text>
            <Text style={[styles.th, qtyStyle]}>QUANTITY</Text>
            {showPrices ? <Text style={[styles.th, styles.colPrice]}>UNIT PRICE</Text> : null}
            {showTax ? <Text style={[styles.th, styles.colVat]}>VAT</Text> : null}
            {showTax ? <Text style={[styles.th, styles.colVatAmt]}>VAT AMOUNT</Text> : null}
            {showPrices ? <Text style={[styles.th, styles.colAmount]}>AMOUNT</Text> : null}
          </View>
          {p.lines.map((l, i) => (
            <View key={i} style={styles.tr} wrap={false}>
              <Text style={descStyle}>{l.description}</Text>
              <Text style={qtyStyle}>
                {num(l.quantity)}
                {l.uom ? ` ${l.uom}` : ""}
              </Text>
              {showPrices ? <Text style={styles.colPrice}>{num(l.unit_price)}</Text> : null}
              {showTax ? <Text style={styles.colVat}>{l.tax_label}</Text> : null}
              {showTax ? <Text style={styles.colVatAmt}>{money(l.tax_amount, p.currency)}</Text> : null}
              {showPrices ? <Text style={styles.colAmount}>{money(l.amount, p.currency)}</Text> : null}
            </View>
          ))}
        </View>

        {/* Payment info (left) + totals (right) — hidden for delivery notes */}
        {showPrices && (
        <View style={styles.bottomRow}>
          <View style={styles.payBlock}>
            {p.paymentTerms ? <Text>Payment terms: {p.paymentTerms}</Text> : null}
            {p.paymentCommunication ? (
              <Text style={{ marginTop: 8 }}>
                <Text style={styles.bold}>Payment Communication: </Text>
                {p.paymentCommunication}
              </Text>
            ) : null}
            {c.bankAccount ? (
              <Text style={{ marginTop: 2 }}>
                Please use the following communication for your payment on this account: {c.bankAccount}
              </Text>
            ) : null}
          </View>
          <View style={styles.totalsBlock}>
            <View style={styles.totalLine}>
              <Text>Untaxed Amount</Text>
              <Text>{money(p.totals.untaxed, p.currency)}</Text>
            </View>
            {showTax && p.totals.tax > 0 ? (
              <View style={styles.totalLine}>
                <Text>VAT</Text>
                <Text>{money(p.totals.tax, p.currency)}</Text>
              </View>
            ) : null}
            <View style={styles.grandLine}>
              <Text style={styles.grandText}>Total</Text>
              <Text style={styles.grandText}>{money(p.totals.total, p.currency)}</Text>
            </View>
          </View>
        </View>
        )}

        {/* Signature line */}
        <View style={styles.signRow}>
          <Text style={styles.signCell}>Name:</Text>
          <Text style={styles.signCell}>Date:</Text>
          <Text style={styles.signCell}>Signature and Stamp:</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>
            {[
              c.phone ? `Phone: ${c.phone}` : null,
              c.whatsapp ? `WhatsApp: ${c.whatsapp}` : null,
              c.email ? `Email: ${c.email}` : null,
            ]
              .filter(Boolean)
              .join("   |   ")}
          </Text>
          {c.website ? <Text style={styles.footerLink}>{c.website}</Text> : null}
          <Text
            style={{ marginTop: 3 }}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
