import logo from "./logo.png";
import React, { useEffect, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { supabase } from "./supabase";

export default function App() {
  const [usuarioLogado, setUsuarioLogado] = useState(null);
  const [login, setLogin] = useState({ usuario: "", senha: "" });
  const [produtos, setProdutos] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [backups, setBackups] = useState([]);
  const [busca, setBusca] = useState("");
  const [temaEscuro, setTemaEscuro] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [movimento, setMovimento] = useState(null);
  const [qtdMovimento, setQtdMovimento] = useState("");
  const [setorDestino, setSetorDestino] = useState("");
  const [assinatura, setAssinatura] = useState("");
  const [produtoEditando, setProdutoEditando] = useState(null);

  const [form, setForm] = useState({
    nome: "",
    setor: "",
    quantidade: "",
    minimo: "",
    patrimonio: "",
    tipo_material: "",
    codigo: "",
    observacao: ""
  });

  const [novoUsuario, setNovoUsuario] = useState({
    nome: "",
    usuario: "",
    senha: "",
    funcao: "",
    setor: "",
    tipo: "usuario"
  });

  const podeAdministrar = usuarioLogado?.tipo === "admin";
  const podeGerenciar = usuarioLogado?.tipo === "admin" || usuarioLogado?.tipo === "gerente";
  const podeMovimentar =
    usuarioLogado?.tipo === "admin" ||
    usuarioLogado?.tipo === "gerente" ||
    usuarioLogado?.tipo === "usuario";

  useEffect(() => {
    const salvo = localStorage.getItem("usuarioLogado");
    const tema = localStorage.getItem("temaEscuro");
    if (salvo) setUsuarioLogado(JSON.parse(salvo));
    if (tema === "true") setTemaEscuro(true);
  }, []);

useEffect(() => {
  document.body.className = "";

  if (temaEscuro) {
    document.body.classList.add("tema-escuro");
  }

  if (usuarioLogado?.tipo === "usuario") {
    document.body.classList.add("usuario");
  }

  if (usuarioLogado?.tipo === "admin") {
    document.body.classList.add("admin");
  }

  localStorage.setItem("temaEscuro", temaEscuro);
}, [temaEscuro, usuarioLogado]);

  useEffect(() => {
    if (!usuarioLogado) return;

    carregarTudo();

    const canalProdutos = supabase
      .channel("produtos-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "produtos" }, carregarProdutos)
      .subscribe();

    const canalHistorico = supabase
      .channel("historico-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "historico" }, carregarHistorico)
      .subscribe();

    const canalUsuarios = supabase
      .channel("usuarios-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, carregarUsuarios)
      .subscribe();

    const canalBackups = supabase
      .channel("backups-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "backups" }, carregarBackups)
      .subscribe();

    const intervalo = setInterval(criarBackupAutomatico, 300000);

    return () => {
      supabase.removeChannel(canalProdutos);
      supabase.removeChannel(canalHistorico);
      supabase.removeChannel(canalUsuarios);
      supabase.removeChannel(canalBackups);
      clearInterval(intervalo);
    };
  }, [usuarioLogado]);

  async function carregarTudo() {
    setCarregando(true);
    await Promise.all([carregarProdutos(), carregarHistorico(), carregarUsuarios(), carregarBackups()]);
    setCarregando(false);
  }

  async function entrar(e) {
    e.preventDefault();

    const { data, error } = await supabase
      .from("usuarios")
      .select("*")
      .ilike("usuario", login.usuario.trim())
      .eq("senha", login.senha.trim())
      .limit(1);

    if (error) {
      alert("Erro ao conectar no banco online.");
      return;
    }

    if (!data || data.length === 0) {
      alert("Usuário ou senha incorretos.");
      return;
    }

    setUsuarioLogado(data[0]);
    localStorage.setItem("usuarioLogado", JSON.stringify(data[0]));
  }

  function sair() {
    localStorage.removeItem("usuarioLogado");
    setUsuarioLogado(null);
    setLogin({ usuario: "", senha: "" });
  }

  async function carregarProdutos() {
    const { data } = await supabase.from("produtos").select("*").order("id", { ascending: true });
    setProdutos(data || []);
  }

  async function carregarHistorico() {
    const { data } = await supabase.from("historico").select("*").order("id", { ascending: false });
    setHistorico(data || []);
  }

  async function carregarUsuarios() {
    const { data } = await supabase.from("usuarios").select("*").order("id", { ascending: true });
    setUsuarios(data || []);
  }

  async function carregarBackups() {
    const { data } = await supabase.from("backups").select("*").order("id", { ascending: false });
    setBackups(data || []);
  }

  async function cadastrarProduto(e) {
    e.preventDefault();

    if (!podeGerenciar) {
      alert("Você não tem permissão para cadastrar produtos.");
      return;
    }

    const { error } = await supabase.from("produtos").insert({
      nome: form.nome,
      setor: form.setor,
      quantidade: Number(form.quantidade),
      minimo: Number(form.minimo),
      patrimonio: form.patrimonio,
      codigo: form.codigo || `COD-${Date.now()}`,
      tipo_material: form.tipo_material,
      observacao: form.observacao
    });

    if (error) {
      alert("Erro ao cadastrar produto.");
      return;
    }

    setForm({
      nome: "",
      setor: "",
      quantidade: "",
      minimo: "",
      patrimonio: "",
      tipo_material: "",
      codigo: "",
      observacao: ""
    });
    carregarProdutos();
  }

  function abrirMovimento(produto, tipo) {
    if (!podeMovimentar) {
      alert("Você não tem permissão para movimentar estoque.");
      return;
    }

    setMovimento({ produto, tipo });
    setQtdMovimento("");
    setSetorDestino("");
    setAssinatura("");
  }

  async function confirmarMovimento() {
    if (movimento.tipo === "excluir") {
      const { error } = await supabase.from("produtos").delete().eq("id", movimento.produto.id);
      if (error) alert("Erro ao excluir produto.");
      setMovimento(null);
      carregarProdutos();
      return;
    }

    if (movimento.tipo === "excluirUsuario") {
      const { error } = await supabase.from("usuarios").delete().eq("id", movimento.usuario.id);
      if (error) alert("Erro ao excluir usuário.");
      setMovimento(null);
      carregarUsuarios();
      return;
    }

    const qtd = Number(qtdMovimento);

    if (!qtd || qtd <= 0) {
      alert("Digite uma quantidade válida.");
      return;
    }

    if (movimento.tipo === "saída" && setorDestino.trim() === "") {
      alert("Informe o setor de destino.");
      return;
    }

    if (assinatura.trim() === "") {
      alert("Informe a assinatura digital.");
      return;
    }

    const produto = movimento.produto;

    const novaQuantidade =
      movimento.tipo === "entrada"
        ? Number(produto.quantidade) + qtd
        : Number(produto.quantidade) - qtd;

    if (novaQuantidade < 0) {
      alert("Quantidade insuficiente em estoque.");
      return;
    }

    const { error: erroProduto } = await supabase
      .from("produtos")
      .update({ quantidade: novaQuantidade })
      .eq("id", produto.id);

    if (erroProduto) {
      alert("Erro ao atualizar produto.");
      return;
    }

    await supabase.from("historico").insert({
      produto: produto.nome,
      patrimonio: produto.patrimonio || "-",
      codigo: produto.codigo || "-",
      tipo: movimento.tipo,
      quantidade: qtd,
      setor_origem: produto.setor,
      setor_destino: movimento.tipo === "saída" ? setorDestino : "-",
      usuario: usuarioLogado.nome,
      assinatura,
      data_hora: new Date().toLocaleString("pt-BR")
    });

    setMovimento(null);
    setQtdMovimento("");
    setSetorDestino("");
    setAssinatura("");
    carregarProdutos();
    carregarHistorico();
  }

  function excluirProduto(id) {
    if (!podeGerenciar) {
      alert("Sem permissão.");
      return;
    }

    const produto = produtos.find((p) => p.id === id);
    setMovimento({ produto, tipo: "excluir" });
  }

  async function cadastrarUsuario(e) {
    e.preventDefault();

    if (!podeAdministrar) {
      alert("Apenas administrador pode cadastrar usuários.");
      return;
    }

    const { error } = await supabase.from("usuarios").insert(novoUsuario);

    if (error) {
      alert("Erro ao cadastrar usuário.");
      return;
    }

    setNovoUsuario({
      nome: "",
      usuario: "",
      senha: "",
      funcao: "",
      setor: "",
      tipo: "usuario"
    });
    carregarUsuarios();
  }

  function excluirUsuario(id) {
    if (!podeAdministrar) return;

    if (id === usuarioLogado.id) {
      alert("Você não pode excluir o usuário logado.");
      return;
    }

    const usuario = usuarios.find((u) => u.id === id);
    setMovimento({ usuario, tipo: "excluirUsuario" });
  }

  function gerarPDF() {
    const doc = new jsPDF();
    doc.text("Relatório de Estoque", 14, 15);
    doc.text(`Gerado por: ${usuarioLogado.nome}`, 14, 23);
    doc.text(`Data: ${new Date().toLocaleString("pt-BR")}`, 14, 31);

    autoTable(doc, {
      startY: 40,
      head: [["Produto", "Setor", "Qtd.", "Mín.", "Patrimônio", "Código"]],
      body: produtos.map((p) => [
        p.nome,
        p.setor,
        p.quantidade,
        p.minimo,
        p.patrimonio || "-",
        p.codigo || "-"
      ])
    });

    doc.save("relatorio-estoque.pdf");
  }

  function gerarPDFHistorico() {
    const doc = new jsPDF();
    doc.text("Relatório de Movimentações", 14, 15);

    autoTable(doc, {
      startY: 25,
      head: [["Data/Hora", "Produto", "Tipo", "Qtd.", "Origem", "Destino", "Usuário", "Assinatura"]],
      body: historico.map((h) => [
        h.data_hora,
        h.produto,
        h.tipo,
        h.quantidade,
        h.setor_origem,
        h.setor_destino,
        h.usuario,
        h.assinatura
      ])
    });

    doc.save("relatorio-movimentacoes.pdf");
  }

  function exportarExcel() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(produtos), "Produtos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(historico), "Historico");
    XLSX.writeFile(wb, "controle-estoque.xlsx");
  }

  function imprimirRelatorio() {
    window.print();
  }

  async function criarBackupAutomatico() {
    if (!usuarioLogado) return;

    await supabase.from("backups").insert({
      data_hora: new Date().toLocaleString("pt-BR"),
      produtos,
      historico,
      usuarios,
      usuario: usuarioLogado.nome
    });

    carregarBackups();
  }

  async function gerarBackupManual() {
    await criarBackupAutomatico();
    alert("Backup criado com sucesso.");
  }

  function baixarBackup() {
    const dados = {
      produtos,
      historico,
      usuarios,
      dataHora: new Date().toLocaleString("pt-BR")
    };

    const blob = new Blob([JSON.stringify(dados, null, 2)], {
      type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "backup-controle-estoque.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function processarCodigoScanner(e) {
    if (e.key === "Enter") {
      const codigo = e.target.value.trim();

      const encontrado = produtos.find(
        (p) =>
          String(p.codigo).trim() === codigo ||
          String(p.patrimonio).trim() === codigo
      );

      if (encontrado) {
        setBusca(encontrado.nome);
        alert(`Produto encontrado: ${encontrado.nome}`);
      } else {
        alert("Produto não encontrado.");
      }
    }
  }
  function abrirEdicaoProduto(produto) {
  if (!podeAdministrar) {
    alert("Apenas administrador pode editar produtos.");
    return;
  }

  setProdutoEditando({
    id: produto.id,
    nome: produto.nome || "",
    setor: produto.setor || "",
    quantidade: produto.quantidade || "",
    minimo: produto.minimo || "",
    patrimonio: produto.patrimonio || "",
    codigo: produto.codigo || "",
    tipo_material: produto.tipo_material || "",
    observacao: produto.observacao || ""
  });
}

async function salvarEdicaoProduto(e) {
  e.preventDefault();

  if (!produtoEditando) return;

  const { error } = await supabase
    .from("produtos")
    .update({
      nome: produtoEditando.nome,
      setor: produtoEditando.setor,
      quantidade: Number(produtoEditando.quantidade),
      minimo: Number(produtoEditando.minimo),
      patrimonio: produtoEditando.patrimonio,
      codigo: produtoEditando.codigo,
      tipo_material: produtoEditando.tipo_material,
      observacao: produtoEditando.observacao
    })
    .eq("id", produtoEditando.id);

  if (error) {
    alert("Erro ao editar produto.");
    return;
  }

  setProdutoEditando(null);
  carregarProdutos();

  alert("Produto atualizado com sucesso.");
}

  if (!usuarioLogado) {
    return (
      <div className="container">
        <section style={{ maxWidth: 420, margin: "80px auto" }}>
          <h1>Controle de Estoque Online</h1>
          <p>Faça login para acessar o sistema.</p>

          <form onSubmit={entrar}>
            <input placeholder="Usuário" value={login.usuario} onChange={(e) => setLogin({ ...login, usuario: e.target.value })} required />
            <input type="password" placeholder="Senha" value={login.senha} onChange={(e) => setLogin({ ...login, senha: e.target.value })} required />
            <button type="submit">Entrar</button>
          </form>
        </section>
      </div>
    );
  }
const produtosRecentes = [...produtos]
  .reverse()
  .slice(0, 5);
  const filtrados = produtos.filter(
    (p) =>
      p.nome.toLowerCase().includes(busca.toLowerCase()) ||
      String(p.codigo || "").toLowerCase().includes(busca.toLowerCase()) ||
      String(p.patrimonio || "").toLowerCase().includes(busca.toLowerCase())
  );
  const filtradosLimitados = filtrados.slice(0, 1000);
  const total = produtos.reduce((soma, p) => soma + Number(p.quantidade), 0);
  const baixo = produtos.filter((p) => Number(p.quantidade) <= Number(p.minimo)).length;

  return (
    <div className="container">
      <header className="topo">
  <div>
    <h1>Controle de Estoque Online</h1>

    <p>
      Usuário: <strong>{usuarioLogado.nome}</strong> | Perfil:{" "}
      <strong>{usuarioLogado.tipo}</strong> | Setor:{" "}
      <strong>{usuarioLogado.setor}</strong>
    </p>
  </div>

  <div className="area-logo">
  <img
    src={logo}
    alt="Logo"
    className="logo-prefeitura"
  />
</div>

  <div>
    <button type="button" onClick={() => setTemaEscuro(!temaEscuro)}>
      {temaEscuro ? "Tema claro" : "Tema escuro"}
    </button>

    <button type="button" onClick={sair}>
      Sair
    </button>
  </div>
</header>

      {carregando && <p>Carregando dados online...</p>}

      <div className="cards">
        <div><span>Produtos cadastrados</span><strong>{produtos.length}</strong></div>
        <div><span>Quantidade total</span><strong>{total}</strong></div>
        <div><span>Baixo estoque</span><strong>{baixo}</strong></div>
        <div><span>Backups salvos</span><strong>{backups.length}</strong></div>
      </div>

      <section className="lista">
        <h2>Ferramentas</h2>
        <button type="button" onClick={gerarPDF}>Relatório PDF Estoque</button>
        <button type="button" onClick={gerarPDFHistorico}>Relatório PDF Histórico</button>
        <button type="button" onClick={exportarExcel}>Exportar Excel</button>
        <button type="button" onClick={imprimirRelatorio}>Imprimir</button>
        <button type="button" onClick={gerarBackupManual}>Backup Manual</button>
        <button type="button" onClick={baixarBackup}>Baixar Backup JSON</button>
        <input placeholder="Scanner código de barras / QR Code" onKeyDown={processarCodigoScanner} />
      </section>

      <section className="dashborad">
        <h2>Dashboard</h2>

        <div className="cards">
          <div><span>Total de produtos</span><strong>{produtos.length}</strong></div>
          <div><span>Itens em baixo estoque</span><strong>{baixo}</strong></div>
          <div><span>Movimentações</span><strong>{historico.length}</strong></div>
        </div>

        <h3>Quantidade por produto</h3>

        {produtosRecentes.map((produto) => (
          <div key={produto.id} style={{ marginBottom: 12 }}>
            <strong>{produto.nome}</strong>
            <div style={{ background: "#e5e7eb", borderRadius: 10, overflow: "hidden", marginTop: 5 }}>
              <div
                style={{
                  width: `${Math.min(Number(produto.quantidade) * 5, 100)}%`,
                  background: "#2563eb",
                  color: "white",
                  padding: "6px 10px"
                }}
              >
                {produto.quantidade}
              </div>
            </div>
          </div>
        ))}
      </section>

      <main>
        {podeGerenciar && (
          <section className="ferramentas">
            <h2>Cadastrar produto</h2>
            <form onSubmit={cadastrarProduto}>
              <input placeholder="Nome do produto/material" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
              <input placeholder="Setor responsável" value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })} required />
              <input type="number" placeholder="Quantidade" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} required />
              <input type="number" placeholder="Estoque mínimo" value={form.minimo} onChange={(e) => setForm({ ...form, minimo: e.target.value })} required />
              <input placeholder="Patrimônio/Tombo" value={form.patrimonio} onChange={(e) => setForm({ ...form, patrimonio: e.target.value })} />
              <input placeholder="Código de barras / QR Code" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
             <input
  placeholder="Tipo de material"
  value={form.tipo_material}
  onChange={(e) =>
    setForm({ ...form, tipo_material: e.target.value })
  }
/>
              <textarea placeholder="Observação" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
              <button type="submit">Cadastrar</button>
            </form>
          </section>
        )}

        <section className={`lista itens-estoque ${usuarioLogado?.tipo === "usuario" ? "usuario-lista" : ""}`}>
          <h2>Itens em estoque</h2>

          <input placeholder="Buscar por produto, patrimônio ou código..." value={busca} onChange={(e) => setBusca(e.target.value)} />

          <div className="tabela-scroll">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Setor</th>
                <th>Qtd.</th>
                <th>Mín.</th>
                <th>Patrimônio</th>
                <th>Código</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>

            <tbody>
              {filtradosLimitados.map((produto) => (
                <tr key={produto.id}>
                  <td>{produto.nome}</td>
                  <td>{produto.setor}</td>
                  <td>{produto.quantidade}</td>
                  <td>{produto.minimo}</td>
                  <td>{produto.patrimonio || "-"}</td>
                  <td>{produto.codigo || "-"}</td>
                  <td>{Number(produto.quantidade) <= Number(produto.minimo) ? "Baixo" : "OK"}</td>
                  <td>
                    {podeMovimentar && (
                      <>
                        <button type="button" onClick={() => abrirMovimento(produto, "entrada")}>Entrada</button>
                        <button type="button" onClick={() => abrirMovimento(produto, "saída")}>Saída</button>
                        <button
  type="button"
  onClick={() => setMovimento({ produto, tipo: "detalhes" })}
>
  Ver
</button>

{usuarioLogado?.tipo === "admin" && (
  <button
    type="button"
    onClick={() => abrirEdicaoProduto(produto)}
  >
    Editar
  </button>
)}

  </>
)}



                    {podeGerenciar && (
                      <button type="button" onClick={() => excluirProduto(produto.id)}>Excluir</button>
                    )}
                  </td>
                </tr>
              ))}

              {filtrados.length === 0 && (
                <tr>
                  <td colSpan="8">Nenhum produto encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </section>
      </main>

      {podeAdministrar && (
        <section className="lista">
          <h2>Cadastro de usuários</h2>

          <form onSubmit={cadastrarUsuario}>
            <input placeholder="Nome completo" value={novoUsuario.nome} onChange={(e) => setNovoUsuario({ ...novoUsuario, nome: e.target.value })} required />
            <input placeholder="Usuário de acesso" value={novoUsuario.usuario} onChange={(e) => setNovoUsuario({ ...novoUsuario, usuario: e.target.value })} required />
            <input type="password" placeholder="Senha" value={novoUsuario.senha} onChange={(e) => setNovoUsuario({ ...novoUsuario, senha: e.target.value })} required />
            <input placeholder="Função" value={novoUsuario.funcao} onChange={(e) => setNovoUsuario({ ...novoUsuario, funcao: e.target.value })} required />
            <input placeholder="Setor" value={novoUsuario.setor} onChange={(e) => setNovoUsuario({ ...novoUsuario, setor: e.target.value })} required />

            <select value={novoUsuario.tipo} onChange={(e) => setNovoUsuario({ ...novoUsuario, tipo: e.target.value })}>
              <option value="consulta">Consulta</option>
              <option value="usuario">Usuário</option>
              <option value="gerente">Gerente</option>
              <option value="admin">Administrador</option>
            </select>

            <button type="submit">Cadastrar usuário</button>
          </form>

          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Usuário</th>
                <th>Função</th>
                <th>Setor</th>
                <th>Tipo</th>
                <th>Ação</th>
              </tr>
            </thead>

            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>{u.nome}</td>
                  <td>{u.usuario}</td>
                  <td>{u.funcao}</td>
                  <td>{u.setor}</td>
                  <td>{u.tipo}</td>
                  <td>
                    <button type="button" onClick={() => excluirUsuario(u.id)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="lista">
        <h2>Histórico de movimentações</h2>

        <table>
          <thead>
            <tr>
              <th>Data/Hora</th>
              <th>Produto</th>
              <th>Patrimônio</th>
              <th>Código</th>
              <th>Tipo</th>
              <th>Qtd.</th>
              <th>Origem</th>
              <th>Destino</th>
              <th>Usuário</th>
              <th>Assinatura</th>
            </tr>
          </thead>

          <tbody>
            {historico.map((item) => (
              <tr key={item.id}>
                <td>{item.data_hora}</td>
                <td>{item.produto}</td>
                <td>{item.patrimonio}</td>
                <td>{item.codigo}</td>
                <td>{item.tipo}</td>
                <td>{item.quantidade}</td>
                <td>{item.setor_origem}</td>
                <td>{item.setor_destino}</td>
                <td>{item.usuario}</td>
                <td>{item.assinatura}</td>
              </tr>
            ))}

            {historico.length === 0 && (
              <tr>
                <td colSpan="10">Nenhuma movimentação registrada.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {movimento && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}>
          <div style={{
            background: temaEscuro ? "#1e293b" : "white",
            color: temaEscuro ? "white" : "black",
            padding: 25,
            borderRadius: 12,
            width: 360
          }}>
            <h2>
  {movimento.tipo === "entrada"
    ? "Entrada de produto"
    : movimento.tipo === "saída"
    ? "Saída de produto"
    : movimento.tipo === "detalhes"
    ? "Detalhes do produto"
    : movimento.tipo === "excluirUsuario"
    ? "Excluir usuário"
    : "Excluir produto"}
</h2>

            <p>
              <strong>
                {movimento.tipo === "excluirUsuario"
                  ? movimento.usuario.nome
                  : movimento.produto.nome}
              </strong>
            </p>
            {movimento.tipo === "detalhes" && (
  <div>
    <p>
      <strong>Tipo de material:</strong>{" "}
      {movimento.produto.tipo_material || "-"}
    </p>

    <p>
      <strong>Patrimônio/Tombo:</strong>{" "}
      {movimento.produto.patrimonio || "-"}
    </p>

    <p>
      <strong>Código:</strong>{" "}
      {movimento.produto.codigo || "-"}
    </p>

    <p>
      <strong>Observação:</strong>
    </p>

    <p>
      {movimento.produto.observacao ||
        "Sem observação cadastrada."}
    </p>

    </div>
)}

{produtoEditando && (
  <div className="modal">
    <div className="modal-content">
      <h2>Editar Produto</h2>

      <form onSubmit={salvarEdicaoProduto}>
        <input
          type="text"
          placeholder="Nome"
          value={produtoEditando.nome}
          onChange={(e) =>
            setProdutoEditando({
              ...produtoEditando,
              nome: e.target.value
            })
          }
        />

        <input
          type="text"
          placeholder="Setor"
          value={produtoEditando.setor}
          onChange={(e) =>
            setProdutoEditando({
              ...produtoEditando,
              setor: e.target.value
            })
          }
        />

        <input
          type="number"
          placeholder="Quantidade"
          value={produtoEditando.quantidade}
          onChange={(e) =>
            setProdutoEditando({
              ...produtoEditando,
              quantidade: e.target.value
            })
          }
        />

        <input
          type="number"
          placeholder="Mínimo"
          value={produtoEditando.minimo}
          onChange={(e) =>
            setProdutoEditando({
              ...produtoEditando,
              minimo: e.target.value
            })
          }
        />

        <input
          type="text"
          placeholder="Patrimônio"
          value={produtoEditando.patrimonio}
          onChange={(e) =>
            setProdutoEditando({
              ...produtoEditando,
              patrimonio: e.target.value
            })
          }
        />

        <input
          type="text"
          placeholder="Código"
          value={produtoEditando.codigo}
          onChange={(e) =>
            setProdutoEditando({
              ...produtoEditando,
              codigo: e.target.value
            })
          }
        />

        <input
          type="text"
          placeholder="Tipo de Material"
          value={produtoEditando.tipo_material}
          onChange={(e) =>
            setProdutoEditando({
              ...produtoEditando,
              tipo_material: e.target.value
            })
          }
        />

        <textarea
          placeholder="Observação"
          value={produtoEditando.observacao}
          onChange={(e) =>
            setProdutoEditando({
              ...produtoEditando,
              observacao: e.target.value
            })
          }
        />

        <button type="submit">
          Salvar Alterações
        </button>

        <button
          type="button"
          onClick={() => setProdutoEditando(null)}
        >
          Cancelar
        </button>
      </form>
    </div>
  </div>
)}

            {(movimento.tipo === "excluir" || movimento.tipo === "excluirUsuario") && (
              <p>Confirma a exclusão?</p>
            )}

            {movimento.tipo !== "excluir" && movimento.tipo !== "excluirUsuario" && (
              <>
                <input type="number" placeholder="Digite a quantidade" value={qtdMovimento} onChange={(e) => setQtdMovimento(e.target.value)} autoFocus />

                {movimento.tipo === "saída" && (
                  <input type="text" placeholder="Setor de destino" value={setorDestino} onChange={(e) => setSetorDestino(e.target.value)} />
                )}

                <input type="text" placeholder="Assinatura digital / nome do responsável" value={assinatura} onChange={(e) => setAssinatura(e.target.value)} />
              </>
            )}

            <button type="button" onClick={confirmarMovimento}>Confirmar</button>
            <button type="button" onClick={() => setMovimento(null)}>Cancelar</button>
          </div>
        </div>
      )}
    {produtoEditando && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.4)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999
    }}
  >
    <div
      style={{
        background: temaEscuro ? "#1e293b" : "white",
        color: temaEscuro ? "white" : "black",
        padding: 25,
        borderRadius: 12,
        width: 420,
        maxHeight: "90vh",
        overflowY: "auto"
      }}
    >
      <h2>Editar produto</h2>

      <form onSubmit={salvarEdicaoProduto}>
        <input
          placeholder="Nome do produto"
          value={produtoEditando.nome}
          onChange={(e) =>
            setProdutoEditando({
              ...produtoEditando,
              nome: e.target.value
            })
          }
          required
        />

        <input
          placeholder="Setor"
          value={produtoEditando.setor}
          onChange={(e) =>
            setProdutoEditando({
              ...produtoEditando,
              setor: e.target.value
            })
          }
          required
        />

        <input
          type="number"
          placeholder="Quantidade"
          value={produtoEditando.quantidade}
          onChange={(e) =>
            setProdutoEditando({
              ...produtoEditando,
              quantidade: e.target.value
            })
          }
          required
        />

        <input
          type="number"
          placeholder="Estoque mínimo"
          value={produtoEditando.minimo}
          onChange={(e) =>
            setProdutoEditando({
              ...produtoEditando,
              minimo: e.target.value
            })
          }
          required
        />

        <input
          placeholder="Patrimônio/Tombo"
          value={produtoEditando.patrimonio}
          onChange={(e) =>
            setProdutoEditando({
              ...produtoEditando,
              patrimonio: e.target.value
            })
          }
        />

        <input
          placeholder="Código de barras / QR Code"
          value={produtoEditando.codigo}
          onChange={(e) =>
            setProdutoEditando({
              ...produtoEditando,
              codigo: e.target.value
            })
          }
        />

        <input
          placeholder="Tipo de material"
          value={produtoEditando.tipo_material}
          onChange={(e) =>
            setProdutoEditando({
              ...produtoEditando,
              tipo_material: e.target.value
            })
          }
        />

        <textarea
          placeholder="Observação"
          value={produtoEditando.observacao}
          onChange={(e) =>
            setProdutoEditando({
              ...produtoEditando,
              observacao: e.target.value
            })
          }
        />

        <button type="submit">Salvar alterações</button>

        <button
          type="button"
          onClick={() => setProdutoEditando(null)}
        >
          Cancelar
        </button>
      </form>
    </div>
  </div>
)}
    </div>
  );
}
