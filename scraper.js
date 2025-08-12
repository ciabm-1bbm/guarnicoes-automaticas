// Importa as bibliotecas que vamos usar
const puppeteer = require('puppeteer');
const fs = require('fs').promises;

// Função principal que executa a mágica
async function fazerMagica() {
    console.log('Iniciando a mágica de hoje...');
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    try {
        // 1. NAVEGAÇÃO E LOGIN
        console.log('Acessando o site e193...');
        await page.goto('https://e193.cbm.rs.gov.br/', { waitUntil: 'networkidle2' });

        console.log('Realizando login...');
        await page.type('input[name="login"]', process.env.BOMBEIROS_USER);
        await page.type('input[name="senha"]', process.env.BOMBEIROS_PASS);
        
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        console.log('Login realizado com sucesso!');

        // 2. NAVEGAÇÃO ATÉ A ESCALA (COM OS PASSOS CORRIGIDOS)
        console.log('Passo 1: Clicando no menu "Guarnição"...');
        // Usaremos um seletor que busca um link que contenha o texto "Guarnição"
        const guarnicaoLinkSelector = 'a.nav-link:has-text("Guarnição")';
        await page.waitForSelector(guarnicaoLinkSelector);
        await page.click(guarnicaoLinkSelector);
        
        console.log('Passo 2: Clicando no submenu "Guarnição Ordinária"...');
        // O link para a escala que já tínhamos provavelmente está dentro deste submenu
        const ordinariaLinkSelector = 'a[href="relatorios/escala_diaria_guarnicoes.php"]';
        await page.waitForSelector(ordinariaLinkSelector);
        await page.click(ordinariaLinkSelector);
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        
        console.log('Passo 3: Clicando em "FILTRAR" para carregar a escala do dia...');
        // Clica no botão de filtrar para garantir que os dados do dia sejam carregados
        const filtrarButtonSelector = 'button:has-text("Filtrar")';
        await page.waitForSelector(filtrarButtonSelector);
        await page.click(filtrarButtonSelector);
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        console.log('Página da escala carregada e filtrada!');
        
        // 3. EXTRAÇÃO DOS DADOS
        console.log('Extraindo dados da tabela...');
        const dadosBrutos = await page.evaluate(() => {
            const linhas = Array.from(document.querySelectorAll('table.table-bordered tbody tr'));
            const dados = [];
            let pelotaoAtual = '';

            linhas.forEach(linha => {
                const th = linha.querySelector('th.header-relatorio');
                if (th) {
                    pelotaoAtual = th.innerText.trim();
                } else if (linha.querySelectorAll('td').length >= 5) {
                    const celulas = linha.querySelectorAll('td');
                    dados.push({
                        pelotao: pelotaoAtual,
                        viatura: celulas[0].innerText.trim(),
                        id: celulas[1].innerText.trim(),
                        nome: celulas[2].innerText.trim(),
                        funcao: celulas[3].innerText.trim(),
                        turno: celulas[4].innerText.trim(),
                        inicio: celulas[5].innerText.trim(),
                        fim: celulas[6].innerText.trim(),
                    });
                }
            });
            return dados;
        });

        // 4. FORMATAÇÃO DOS DADOS
        console.log('Formatando os dados com nossas Regras de Excelência...');
        const guarnicoesData = formatarDados(dadosBrutos);
        const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');

        // 5. ATUALIZAÇÃO DO ARQUIVO HTML
        console.log('Lendo o template do site...');
        const templateHtml = await fs.readFile('template.html', 'utf-8');

        console.log('Injetando dados atualizados...');
        let finalHtml = templateHtml.replace(/\(\d{2}\/[A-Za-z]{3}\/\d{4}\)/, `(${hoje}/${new Date().getFullYear()})`);
        finalHtml = finalHtml.replace(
            'const guarnicoesData = {}', 
            `const guarnicoesData = ${JSON.stringify(guarnicoesData, null, 4)}`
        );

        console.log('Salvando o novo site em index.html...');
        await fs.writeFile('index.html', finalHtml);

    } catch (error) {
        console.error('A mágica falhou:', error);
        process.exit(1);
    } finally {
        await browser.close();
        console.log('Mágica concluída!');
    }
}

// Função para aplicar nossas regras de excelência
function formatarDados(dadosBrutos) {
    const dadosFormatados = {};
    const pelotaoOrdem = ["OFICIAL DE SERVIÇO", "AÇORIANOS", "TERESÓPOLIS", "ASSUNÇÃO", "RESTINGA", "BELÉM NOVO", "PASSO D'AREIA", "FLORESTA", "PARTENON"];
    
    function getNomePelotao(rawName) {
        for (const nome of pelotaoOrdem) {
            // Usa toUpperCase para garantir a correspondência (ex: "passo d'areia" e "PASSO D'AREIA")
            if (rawName.toUpperCase().includes(nome.toUpperCase())) return nome;
        }
        if (rawName.includes('ESTADO MAIOR') || rawName.includes('AODC')) return "OFICIAL DE SERVIÇO";
        return null;
    }

    dadosBrutos.forEach(militar => {
        const nomePelotao = getNomePelotao(militar.pelotao);
        if (!nomePelotao) return;

        if (!dadosFormatados[nomePelotao]) {
            dadosFormatados[nomePelotao] = {};
        }

        let viaturaKey = militar.viatura.split(' ')[0].replace(/-/g, '_');
        let viaturaDisplay = militar.viatura.split(' ')[0];

        if (viaturaKey.startsWith('AEM_') || viaturaKey.startsWith('AT_')) {
            const existente = dadosFormatados[nomePelotao]['AEM_E_AT'];
            if (existente) {
                viaturaDisplay = existente.viatura_display + " e " + viaturaDisplay;
                existente.viatura_display = viaturaDisplay;
            } else {
                 viaturaDisplay = `${viaturaDisplay} (Viatura Leve)`;
            }
            viaturaKey = 'AEM_E_AT';
        }

        if (!dadosFormatados[nomePelotao][viaturaKey]) {
             dadosFormatados[nomePelotao][viaturaKey] = {
                viatura_display: viaturaDisplay,
                militares: [],
                turno: "24h",
                inicio_data: militar.inicio.split(' ')[0],
                inicio_hora: militar.inicio.split(' ')[1],
                fim_data: militar.fim.split(' ')[0],
                fim_hora: militar.fim.split(' ')[1],
            };
        }
        
        let funcaoFormatada = militar.funcao;
        if (militar.turno !== '24' && militar.inicio && militar.fim) {
            const inicio = militar.inicio.split(' ')[1];
            const fim = militar.fim.split(' ')[1];
            funcaoFormatada += ` (${inicio}-${fim})`;
            dadosFormatados[nomePelotao][viaturaKey].turno = "Misto";
        }
        
        if (nomePelotao === "OFICIAL DE SERVIÇO") {
            if (funcaoFormatada.includes('SUPERVISOR')) funcaoFormatada = 'OFICIAL SUPERVISOR (Alfa 4)';
            if (funcaoFormatada.includes('COMANDANTE DE SOCORRO') || funcaoFormatada.includes('OFICIAL DE SV')) funcaoFormatada = 'COMANDANTE DE SOCORRO (Alfa 5)';
            if ((funcaoFormatada.includes('MOTORISTA') || funcaoFormatada.includes('CONDUTOR')) && militar.pelotao.includes('ESTADO MAIOR')) funcaoFormatada = 'COV DO ALFA 5';
            if ((funcaoFormatada.includes('MOTORISTA') || funcaoFormatada.includes('CONDUTOR')) && militar.pelotao.includes('AODC')) funcaoFormatada = 'COV DO ALFA 4';
        }
        
        dadosFormatados[nomePelotao][viaturaKey].militares.push({
            funcao: funcaoFormatada,
            nome: militar.nome
        });
    });

    return dadosFormatados;
}

// Inicia a execução do robô
fazerMagica();