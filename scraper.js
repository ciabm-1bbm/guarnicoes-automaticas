// Importa as bibliotecas que vamos usar
const puppeteer = require('puppeteer');
const fs = require('fs').promises;

// Função principal que executa a mágica
async function fazerMagica() {
    console.log('Iniciando a mágica de hoje...');
    // Inicia o navegador invisível. Os 'args' são para compatibilidade com o ambiente do GitHub.
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    try {
        // 1. NAVEGAÇÃO E LOGIN
        console.log('Acessando o site dos bombeiros...');
        // *** ATENÇÃO: Esta URL é um EXEMPLO. Precisaremos colocar a URL correta da página de login. ***
        await page.goto('https://sistemas.cbm.rs.gov.br/sisop/login.php', { waitUntil: 'networkidle2' });

        // *** ATENÇÃO: Os nomes '#login' e '#senha' SÃO EXEMPLOS. Precisaremos ajustá-los para os nomes corretos. ***
        console.log('Realizando login...');
        await page.type('#login', process.env.BOMBEIROS_USER); // Pega o usuário do GitHub Secrets
        await page.type('#senha', process.env.BOMBEIROS_PASS); // Pega a senha do GitHub Secrets
        
        // Clica no botão de login e espera a página carregar
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        console.log('Login realizado com sucesso!');

        // 2. EXTRAÇÃO DOS DADOS
        console.log('Navegando para a página da escala...');
        // *** ATENÇÃO: Esta URL também é um EXEMPLO. ***
        await page.goto('https://sistemas.cbm.rs.gov.br/sisop/relatorios/escala_diaria_guarnicoes.php', { waitUntil: 'networkidle2' });
        
        console.log('Extraindo dados da tabela...');
        // Esta função é executada dentro da página do navegador para pegar os dados
        const dadosBrutos = await page.evaluate(() => {
            const linhas = Array.from(document.querySelectorAll('table tbody tr')); // Pega todas as linhas da tabela
            const dados = [];
            let pelotaoAtual = '';

            linhas.forEach(linha => {
                // Verifica se a linha é um título de pelotão
                if (linha.querySelector('th.header-relatorio')) {
                    pelotaoAtual = linha.querySelector('th.header-relatorio').innerText.trim();
                } 
                // Verifica se é uma linha de dados de militar
                else if (linha.querySelectorAll('td').length > 2) {
                    const celulas = linha.querySelectorAll('td');
                    dados.push({
                        pelotao: pelotaoAtual,
                        viatura: celulas[0].innerText.trim(),
                        id: celulas[1].innerText.trim(),
                        nome: celulas[2].innerText.trim(),
                        funcao: celulas[3].innerText.trim(),
                    });
                }
            });
            return dados;
        });

        // 3. FORMATAÇÃO DOS DADOS
        console.log('Formatando os dados com nossas Regras de Excelência...');
        const guarnicoesData = formatarDados(dadosBrutos); // Nossa função de formatação
        const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');

        // 4. ATUALIZAÇÃO DO ARQUIVO HTML
        console.log('Lendo o template do site...');
        const templateHtml = await fs.readFile('template.html', 'utf-8');

        console.log('Injetando dados atualizados...');
        // Substitui o marcador de data no título
        let finalHtml = templateHtml.replace(/\(\d{2}\/[A-Za-z]{3}\/\d{4}\)/, `(${hoje}/${new Date().getFullYear()})`);
        
        // Substitui o marcador do objeto de dados
        finalHtml = finalHtml.replace(
            'const guarnicoesData = {}', 
            `const guarnicoesData = ${JSON.stringify(guarnicoesData, null, 4)}`
        );

        console.log('Salvando o novo site em index.html...');
        await fs.writeFile('index.html', finalHtml);

    } catch (error) {
        console.error('A mágica falhou:', error);
        process.exit(1); // Encerra com erro para o GitHub saber que falhou
    } finally {
        await browser.close();
        console.log('Mágica concluída!');
    }
}

// Função para aplicar nossas regras de excelência
function formatarDados(dadosBrutos) {
    const dadosFinais = {};
    const ordemExibicao = ["OFICIAL DE SERVIÇO", "AÇORIANOS", "TERESÓPOLIS", "ASSUNÇÃO", "RESTINGA", "BELÉM NOVO", "PASSO D'AREIA", "FLORESTA", "PARTENON"];

    // Aqui entra toda a nossa lógica de agrupar, formatar e filtrar...
    // Esta é uma versão simplificada que teremos que refinar
    
    // Agrupa todos os militares por pelotão
    const porPelotao = {};
    dadosBrutos.forEach(militar => {
        // Exemplo de como extrair o nome do pelotão da string do PDF
        const nomePelotao = extrairNomePelotao(militar.pelotao);
        if (!porPelotao[nomePelotao]) {
            porPelotao[nomePelotao] = [];
        }
        porPelotao[nomePelotao].push(militar);
    });

    // Depois de agrupar, precisaríamos de mais lógica para agrupar por viatura,
    // unificar AEM/AT, formatar os turnos, etc.
    // Por enquanto, esta é uma estrutura básica para começarmos.
    
    return porPelotao; // Retorna os dados agrupados
}

function extrairNomePelotao(textoCompleto) {
    // Função simples para pegar o nome do pelotão (ex: "TERESÓPOLIS")
    const partes = textoCompleto.split('/');
    return partes[partes.length - 1].trim();
}


// Inicia a execução do robô
fazerMagica();