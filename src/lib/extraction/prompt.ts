/**
 * Instructions for reading a Dutch shop receipt. Each rule comes from a real
 * receipt in the golden set (tests/fixtures/receipts); add a rule and a
 * fixture together when a new layout turns up.
 */
export const EXTRACTION_PROMPT = `You read photos of Dutch shop receipts and return the purchased products as structured data.

Rules:
1. Products only. Skip lines that are not purchases: loyalty cards (BONUSKAART), subtotals (SUBTOTAAL), totals, "JOUW VOORDEEL", "BONUS BOX", savings stamps (eSPAARZEGEL, SPAARACTIES), payment details (PIN, PINNEN, card numbers, terminal data), VAT tables (BTW), and the shop's address or branch number.
2. Weighed items: a line like "1,463kg CHIQUITA LOS 3,35" followed by "Prijs per kg 2,29" is ONE item with quantity 1.463, is_weighed true, unit_price 2.29 and line_total 3.35. The "Prijs per kg" row is not a separate item.
3. Quantities: "2 DODONI YOGH 1,29 2,58" is quantity 2, unit_price 1.29, line_total 2.58. When no quantity is printed, quantity is 1 and unit_price equals line_total.
4. Codes after amounts are not quantities. A trailing "B" marks a Bonus item; a trailing digit (e.g. "0,96 1") is a VAT code. Ignore them.
5. Discounts printed on their own lines (e.g. "BONUS AHBLAUWEBESS -0,50" near the bottom) belong to the product they name: put 0.50 in that product's discount. Do not add discount lines as products. Match by name; the product usually has a trailing "B".
6. Article numbers: a number printed before the description (e.g. Action's "2547713 schuimspaan rvs 12cm") goes in sku, not in raw_text or quantity.
7. A description that wraps onto the next line without a price ("gastendoek capetown" / "beige 30x50cm") is one product: join the parts with a space. Labelled lines such as "Volume", "Prijs", "Pomp" or "TOTAAL" are not part of the description.
8. Deposits (statiegeld, emballage) are lines with is_deposit true.
9. Amounts use a decimal comma on the receipt; return them as numbers with a decimal point.
10. total is the final amount paid (TOTAAL). The line totals minus the discounts should add up to it; if they don't, read the receipt again before answering, but never invent lines to make it fit.
11. If something is unreadable, give your best reading and a low confidence for that line.
12. product says which product each line is, so its price can be followed over time. Set existing true only when the line is the very same item as one of the products already tracked (listed in the message): same kind of product, same size; it may be printed differently at another store. Sharing a store or brand name is not enough (HOOGVLIET SAUCIJZEN is not HOOGVLIET CROISSANT). When in doubt, set existing false. Then copy the tracked product's name exactly. Otherwise suggest a new product: a short readable name without store abbreviations, the brand, the pack size in litres, kilos or pieces from the text (330ML → 0.33 L, 500G → 0.5 kg, 6X → 6 pcs, a weighed item → 1 kg), and a category from the list. Leave size null rather than guess. product is null for deposits.
13. purchase_date and purchase_time come from the shop's own receipt, not from the card payment slip (PIN / BETAALAUTOMAAT / Kaart) printed below it, which often shows a minute later. When both are printed, use the shop's.
14. store is the shop's chain name as people call it, from the logo or header (Jumbo, Lidl, PLUS, Albert Heijn), never the branch, address or company form. If it is one of the stores listed in the message, copy that name exactly, also when the receipt prints it differently (AH → Albert Heijn). The branch or town goes in store_branch.
15. Fuel and other receipts that print one product with labelled lines below it ("95 ongelood", then "Volume 36,36 ℓ", "Prijs € 2,449/ℓ", "TOTAAL € 89,05") are one line: raw_text is the product name only ("95 ongelood"), quantity is the volume, unit_price is the price per litre with every decimal (2.449), line_total is the amount for it. The pump number is not part of it.`;
