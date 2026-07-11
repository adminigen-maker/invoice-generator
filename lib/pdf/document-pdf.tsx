import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#0f172a" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  companyName: { fontSize: 14, fontWeight: 700 },
  docTitle: { fontSize: 20, fontWeight: 700, marginBottom: 2, textAlign: "right" },
  meta: { textAlign: "right", color: "#475569" },
  section: { marginBottom: 12 },
  row: { flexDirection: "row" },
  col: { flex: 1 },
  label: { color: "#64748b", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5 },
  bold: { fontWeight: 700 },
  table: { borderTop: 1, borderColor: "#e2e8f0", marginTop: 8 },
  th: {
    flexDirection: "row", borderBottom: 1, borderColor: "#e2e8f0",
    paddingVertical: 6, paddingHorizontal: 4, backgroundColor: "#f8fafc",
  },
  tr: { flexDirection: "row", borderBottom: 1, borderColor: "#f1f5f9", paddingVertical: 6, paddingHorizontal: 4 },
  colDesc: { flex: 3 },
  colQty:  { flex: 1, textAlign: "right" },
  colPrice:{ flex: 1.2, textAlign: "right" },
  colTax:  { flex: 1, textAlign: "right" },
  colTotal:{ flex: 1.4, textAlign: "right" },
  totals: { marginTop: 12, alignSelf: "flex-end", width: 240 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { borderTop: 1, borderColor: "#0f172a", marginTop: 4, paddingTop: 4, fontWeight: 700, fontSize: 12 },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 8, color: "#94a3b8" },
});

export type DocLine = {
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
  tax_label?: string;
};

export type DocumentPdfProps = {
  documentTitle: string;         // "QUOTATION" / "INVOICE" / etc.
  documentNumber: string;
  documentDate: string;
  dueDate?: string;
  company: {
    name: string;
    address?: string;
    trn?: string;
    email?: string;
    phone?: string;
  };
  customer: {
    name: string;
    address?: string;
    trn?: string;
  };
  currency: string;
  lines: DocLine[];
  totals: {
    subtotal: number;
    discount_total: number;
    tax_total: number;
    total: number;
  };
  notes?: string;
  terms?: string;
};

const money = (n: number, cur: string) => `${cur} ${n.toFixed(2)}`;

export function DocumentPdf(p: DocumentPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{p.company.name}</Text>
            {p.company.address && <Text>{p.company.address}</Text>}
            {p.company.trn && <Text>TRN: {p.company.trn}</Text>}
            {p.company.email && <Text>{p.company.email}</Text>}
            {p.company.phone && <Text>{p.company.phone}</Text>}
          </View>
          <View>
            <Text style={styles.docTitle}>{p.documentTitle}</Text>
            <Text style={styles.meta}>{p.documentNumber}</Text>
            <Text style={styles.meta}>Date: {p.documentDate}</Text>
            {p.dueDate && <Text style={styles.meta}>Due: {p.dueDate}</Text>}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Bill to</Text>
          <Text style={styles.bold}>{p.customer.name}</Text>
          {p.customer.address && <Text>{p.customer.address}</Text>}
          {p.customer.trn && <Text>TRN: {p.customer.trn}</Text>}
        </View>

        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={styles.colDesc}>Description</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colPrice}>Unit price</Text>
            <Text style={styles.colTax}>Tax</Text>
            <Text style={styles.colTotal}>Total</Text>
          </View>
          {p.lines.map((l, i) => (
            <View key={i} style={styles.tr}>
              <Text style={styles.colDesc}>{l.description}</Text>
              <Text style={styles.colQty}>{Number(l.quantity).toFixed(2)}</Text>
              <Text style={styles.colPrice}>{money(Number(l.unit_price), p.currency)}</Text>
              <Text style={styles.colTax}>{l.tax_label ?? "—"}</Text>
              <Text style={styles.colTotal}>{money(Number(l.line_total), p.currency)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}><Text>Subtotal</Text><Text>{money(p.totals.subtotal, p.currency)}</Text></View>
          {p.totals.discount_total > 0 && (
            <View style={styles.totalRow}><Text>Discount</Text><Text>− {money(p.totals.discount_total, p.currency)}</Text></View>
          )}
          <View style={styles.totalRow}><Text>Tax</Text><Text>{money(p.totals.tax_total, p.currency)}</Text></View>
          <View style={[styles.totalRow, styles.grand]}><Text>Total</Text><Text>{money(p.totals.total, p.currency)}</Text></View>
        </View>

        {(p.notes || p.terms) && (
          <View style={{ marginTop: 24 }}>
            {p.notes && (<>
              <Text style={styles.label}>Notes</Text>
              <Text>{p.notes}</Text>
            </>)}
            {p.terms && (<View style={{ marginTop: 8 }}>
              <Text style={styles.label}>Terms & conditions</Text>
              <Text>{p.terms}</Text>
            </View>)}
          </View>
        )}

        <Text style={styles.footer}>
          {p.company.name} — Generated {new Date().toISOString().slice(0, 10)}
        </Text>
      </Page>
    </Document>
  );
}
