// Reporte mensual en Excel (.xlsx) con resumen por categoría y gráficos nativos.
// Se arma el archivo OOXML a mano con JSZip (lib/jszip.min.js), sin librerías de terceros extra.

(function () {
  const COLORES = ['0F766E', 'F59E0B', '2563EB', 'DC2626', '7C3AED', '14B8A6', 'DB2777', '84CC16', '64748B'];

  const esc = (t) => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const col = (i) => String.fromCharCode(65 + i); // A..Z (alcanza para este reporte)

  // ---------- celdas ----------
  // estilos (índices de cellXfs en styles.xml)
  const E = { titulo: 1, cab: 2, txt: 3, ent: 4, sol: 5, pct: 6, totTxt: 7, totSol: 8, totEnt: 9, sub: 10, clave: 11, nota: 12, totPct: 13 };

  function celda(ref, v, s) {
    if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${s}"/>`;
    if (typeof v === 'number') return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
    return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }

  function hoja(filas, { anchos = [], extra = '', vista = '', dibujo = '' } = {}) {
    const cols = anchos.length
      ? `<cols>${anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const datos = filas.map((f, r) => `<row r="${r + 1}"${f.alto ? ` ht="${f.alto}" customHeight="1"` : ''}>${
      f.celdas.map(([v, s], c) => (v === undefined ? '' : celda(col(c) + (r + 1), v, s))).join('')}</row>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0" showGridLines="0">${vista}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${datos}</sheetData>${extra}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>${dibujo}</worksheet>`;
  }

  // ---------- gráfico circular ----------
  function graficoCircular(titulo, categorias, valores, refCat, refVal) {
    const n = categorias.length;
    const puntos = categorias.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${COLORES[i % COLORES.length]}"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join('');
    const strCache = `<c:strCache><c:ptCount val="${n}"/>${categorias.map((c, i) => `<c:pt idx="${i}"><c:v>${esc(c)}</c:v></c:pt>`).join('')}</c:strCache>`;
    const numCache = `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${valores.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache>`;
    const texto = (sz, b) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${b}"><a:solidFill><a:srgbClr val="1E293B"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-PE"/></a:p></c:txPr>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:roundedCorners val="0"/>
<c:chart>
<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="1"/></a:pPr><a:r><a:rPr lang="es-PE" sz="1400" b="1"><a:solidFill><a:srgbClr val="1E293B"/></a:solidFill></a:rPr><a:t>${esc(titulo)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
<c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>
<c:pieChart><c:varyColors val="1"/>
<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${esc(titulo)}</c:v></c:tx>${puntos}
<c:dLbls><c:numFmt formatCode="0.0%" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${texto(1100, 1)}<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls>
<c:cat><c:strRef><c:f>${refCat}</c:f>${strCache}</c:strRef></c:cat>
<c:val><c:numRef><c:f>${refVal}</c:f>${numCache}</c:numRef></c:val>
</c:ser>
<c:firstSliceAng val="0"/>
</c:pieChart>
<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>
</c:plotArea>
<c:legend><c:legendPos val="r"/><c:overlay val="0"/>${texto(1000, 0)}</c:legend>
<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
</c:chart>
<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr>
</c:chartSpace>`;
  }

  function anclaje(id, desde, hasta) {
    return `<xdr:twoCellAnchor editAs="oneCell">
<xdr:from><xdr:col>${desde[0]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${desde[1]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>${hasta[0]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${hasta[1]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id + 1}" name="Gráfico ${id}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${id}"/></a:graphicData></a:graphic>
</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
  }

  const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;S/ &quot;#,##0.00"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>
<fonts count="6">
<font><sz val="11"/><color rgb="FF1E293B"/><name val="Calibri"/></font>
<font><b/><sz val="16"/><color rgb="FF0F766E"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF1E293B"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/></font>
</fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F4"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD3D7DE"/></left><right style="thin"><color rgb="FFD3D7DE"/></right><top style="thin"><color rgb="FFD3D7DE"/></top><bottom style="thin"><color rgb="FFD3D7DE"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="1" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="165" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  // ---------- reporte ----------
  // retiros: productos retirados del periodo; tituloMes: "Octubre 2026"
  window.generarExcelMensual = async function (retiros, tituloMes) {
    const valor = (r) => (r.precio || 0) * (r.cantidad || 1);
    const unidades = retiros.reduce((s, r) => s + (r.cantidad || 1), 0);
    const perdida = retiros.reduce((s, r) => s + valor(r), 0);
    const sinPrecio = retiros.filter((r) => !(r.precio > 0)).length;

    // Resumen por categoría (área)
    const grupos = {};
    retiros.forEach((r) => {
      const g = grupos[r.categoria] || (grupos[r.categoria] = { productos: 0, unidades: 0, perdida: 0 });
      g.productos += 1;
      g.unidades += r.cantidad || 1;
      g.perdida += valor(r);
    });
    const cats = Object.entries(grupos).sort((a, b) => b[1].perdida - a[1].perdida || b[1].unidades - a[1].unidades);
    const r2 = (n) => Math.round(n * 100) / 100;

    // --- Hoja 1: Resumen ---
    const F = [];
    F.push({ alto: 24, celdas: [['Reporte de pérdidas por vencimiento', E.titulo]] });
    F.push({ celdas: [[`Control de Vencimientos · Tienda OXXO El Polo · ${tituloMes} · Generado el ${new Date().toLocaleString('es-PE')}`, E.sub]] });
    F.push({ celdas: [] });
    F.push({ celdas: [['Indicadores del mes', E.clave]] });
    F.push({ celdas: [['Productos retirados', E.txt], [retiros.length, E.ent]] });
    F.push({ celdas: [['Unidades retiradas', E.txt], [unidades, E.ent]] });
    F.push({ celdas: [['Pérdida total (costo)', E.totTxt], [r2(perdida), E.totSol]] });
    F.push({ celdas: [['Productos sin costo registrado', E.txt], [sinPrecio, E.ent]] });
    F.push({ celdas: [] });
    F.push({ celdas: [['Pérdida por categoría', E.clave]] });
    const filaCab = F.length + 1; // fila de encabezados (1-based)
    F.push({ alto: 20, celdas: [['Categoría', E.cab], ['Productos', E.cab], ['Unidades', E.cab], ['Pérdida (S/)', E.cab], ['% de la pérdida', E.cab], ['% de unidades', E.cab]] });
    cats.forEach(([nombre, g]) => F.push({ celdas: [
      [nombre, E.txt], [g.productos, E.ent], [g.unidades, E.ent], [r2(g.perdida), E.sol],
      [perdida > 0 ? g.perdida / perdida : 0, E.pct], [unidades > 0 ? g.unidades / unidades : 0, E.pct],
    ] }));
    F.push({ celdas: [['Total', E.totTxt], [retiros.length, E.totEnt], [unidades, E.totEnt], [r2(perdida), E.totSol], [perdida > 0 ? 1 : 0, E.totPct], [unidades > 0 ? 1 : 0, E.totPct]] });
    F.push({ celdas: [] });
    if (sinPrecio) {
      F.push({ alto: 32, celdas: [[`Nota: ${sinPrecio} de ${retiros.length} productos no tienen costo registrado, por eso no suman a la pérdida en soles. Registra el costo al crear o editar el producto.`, E.nota]] });
    }
    const primera = filaCab + 1, ultima = filaCab + cats.length;
    const merges = sinPrecio ? `<mergeCells count="3"><mergeCell ref="A1:F1"/><mergeCell ref="A2:F2"/><mergeCell ref="A${F.length}:F${F.length}"/></mergeCells>`
      : '<mergeCells count="2"><mergeCell ref="A1:F1"/><mergeCell ref="A2:F2"/></mergeCells>';
    const hojaResumen = hoja(F, { anchos: [30, 12, 12, 15, 16, 15], extra: merges });

    // --- Hoja 2: Detalle ---
    const D = [{ alto: 20, celdas: ['Producto', 'Categoría', 'Proveedor', 'Cantidad', 'Costo unit. (S/)', 'Pérdida (S/)', 'Fecha de vencimiento', 'Fecha de retiro', 'Retirado por'].map((t) => [t, E.cab]) }];
    const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('es-PE') : '');
    retiros.forEach((r) => D.push({ celdas: [
      [r.nombre, E.txt], [r.categoria, E.txt], [r.proveedor || '', E.txt], [r.cantidad || 1, E.ent],
      [r2(r.precio || 0), E.sol], [r2(valor(r)), E.sol],
      [r.fecha_vencimiento ? r.fecha_vencimiento.split('-').reverse().join('/') : '', E.txt],
      [fmt(r.retirado_en), E.txt], [r.retirado_por_nombre || '', E.txt],
    ] }));
    const hojaDetalle = hoja(D, {
      anchos: [34, 18, 16, 10, 15, 13, 20, 16, 18],
      vista: '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
      extra: `<autoFilter ref="A1:I${Math.max(D.length, 2)}"/>`,
    });

    // --- Hoja 3: Gráficos ---
    const hayGraficos = cats.length > 0;
    const G = [{ alto: 24, celdas: [['Gráficos: pérdida por área', E.titulo]] },
      { celdas: [[`${tituloMes} · Porcentaje que representa cada categoría`, E.sub]] }];
    if (!hayGraficos) G.push({ celdas: [['No hay retiros en este mes.', E.nota]] });
    if (perdida <= 0 && hayGraficos) G.push({ celdas: [['Aún no hay costos registrados: el gráfico de pérdida se completará cuando los productos tengan costo.', E.nota]] });
    const hojaGraficos = hoja(G, { anchos: [4, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
      dibujo: hayGraficos ? '<drawing r:id="rId1"/>' : '' });

    // --- Paquete ---
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hayGraficos ? `
<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
<Override PartName="/xl/charts/chart2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>` : ''}
</Types>`);
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView/></bookViews>
<sheets><sheet name="Resumen" sheetId="1" r:id="rId1"/><sheet name="Gráficos" sheetId="3" r:id="rId3"/><sheet name="Detalle" sheetId="2" r:id="rId2"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="2" hidden="1">Detalle!$A$1:$I$${Math.max(D.length, 2)}</definedName></definedNames>
</workbook>`);
    zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
    zip.file('xl/styles.xml', ESTILOS);
    zip.file('xl/worksheets/sheet1.xml', hojaResumen);
    zip.file('xl/worksheets/sheet2.xml', hojaDetalle);
    zip.file('xl/worksheets/sheet3.xml', hojaGraficos);
    if (hayGraficos) {
      zip.file('xl/worksheets/_rels/sheet3.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
      zip.file('xl/drawings/drawing1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${anclaje(1, [1, 3], [9, 21])}
${anclaje(2, [1, 22], [9, 40])}
</xdr:wsDr>`);
      zip.file('xl/drawings/_rels/drawing1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart2.xml"/>
</Relationships>`);
      const nombres = cats.map(([n]) => n);
      zip.file('xl/charts/chart1.xml', graficoCircular('Pérdida en soles por área (%)', nombres, cats.map(([, g]) => r2(g.perdida)),
        `Resumen!$A$${primera}:$A$${ultima}`, `Resumen!$D$${primera}:$D$${ultima}`));
      zip.file('xl/charts/chart2.xml', graficoCircular('Unidades retiradas por área (%)', nombres, cats.map(([, g]) => g.unidades),
        `Resumen!$A$${primera}:$A$${ultima}`, `Resumen!$C$${primera}:$C$${ultima}`));
    }
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };
})();
