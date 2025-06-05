document.addEventListener('DOMContentLoaded', () => {
    // Estas variáveis só existem se estivermos na página gallery.html
    const uploadForm = document.getElementById('uploadForm');
    const galleryContainer = document.getElementById('galleryContainer');
    const messageElement = document.getElementById('message');
    const loadingMessage = document.getElementById('loadingMessage');

    // A URL DO SEU BACK-END DO RAILWAY
    const RENDER_API_URL = 'https://web-production-14bba.up.railway.app';

    // Função para exibir mensagens (sucesso/erro)
    function showMessage(msg, type = 'success') {
        messageElement.textContent = msg;
        messageElement.className = ''; // Limpa classes anteriores
        messageElement.classList.add(type);
        messageElement.classList.remove('hidden');
        setTimeout(() => {
            messageElement.classList.add('hidden');
        }, 5000); // Esconde a mensagem após 5 segundos
    }

    // Só executa a lógica da galeria se os elementos existirem (ou seja, se estiver em gallery.html)
    if (galleryContainer && uploadForm) {
        // Função para carregar as memórias da API
        async function loadMemories() {
            loadingMessage.style.display = 'block'; // Mostra mensagem de carregamento
            galleryContainer.innerHTML = ''; // Limpa a galeria existente

            try {
                const response = await fetch(`${RENDER_API_URL}/api/memories`);
                if (!response.ok) {
                    throw new Error('Erro ao buscar memórias.');
                }
                const memories = await response.json();

                if (memories.length === 0) {
                    galleryContainer.innerHTML = '<p class="no-memories">Nenhuma memória adicionada ainda. Adicione a primeira!</p>';
                } else {
                    memories.forEach(memory => {
                        const galleryItem = document.createElement('div');
                        galleryItem.classList.add('gallery-item');
                        galleryItem.dataset.id = memory.id; // Armazena o ID da memória no elemento HTML

                        // A URL da imagem já vem do Cloudinary
                        galleryItem.innerHTML = `
                            <img src="${memory.image_path}" alt="Memória de ${memory.event_date}">
                            <div class="item-details">
                                <h3>${new Date(memory.event_date).toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                                <p>${memory.description}</p>
                                <button class="delete-button" data-id="${memory.id}">Excluir</button>
                            </div>
                        `;
                        // Adiciona o item com opacidade 0 para animar
                        galleryItem.style.opacity = 0; 
                        galleryContainer.appendChild(galleryItem);
                    });

                    // --- LÓGICA DE ANIMAÇÃO COM ANIME.JS (NOVO) ---
                    anime({
                        targets: '.gallery-item', // Seleciona todos os cards da galeria
                        opacity: [0, 1],         // Anima a opacidade de 0 a 1
                        translateY: [50, 0],     // Anima a posição Y de 50px para 0 (efeito de slide-up)
                        delay: anime.stagger(100), // Atraso de 100ms entre o início da animação de cada item
                        duration: 800,           // Duração da animação (0.8 segundos)
                        easing: 'easeOutQuad',   // Tipo de suavização da animação
                    });
                    // --- FIM DA LÓGICA DE ANIMAÇÃO ---


                    // Adiciona event listeners para os botões de exclusão APÓS criá-los
                    document.querySelectorAll('.delete-button').forEach(button => {
                        button.addEventListener('click', async (event) => {
                            const memoryId = event.target.dataset.id;
                            if (confirm('Tem certeza que deseja excluir esta memória? Esta ação é irreversível.')) {
                                try {
                                    // Usando a URL do back-end do Railway
                                    const response = await fetch(`${RENDER_API_URL}/api/memories/${memoryId}`, {
                                        method: 'DELETE'
                                    });

                                    if (!response.ok) {
                                        const errorData = await response.json();
                                        throw new Error(errorData.error || 'Erro ao excluir memória.');
                                    }

                                    const result = await response.json();
                                    showMessage(result.message, 'success');
                                    loadMemories(); // Recarrega a galeria para refletir a exclusão
                                } catch (error) {
                                    console.error('Erro ao excluir:', error);
                                    showMessage(error.message, 'error');
                                }
                            }
                        });
                    });
                }
            } catch (error) {
                console.error('Erro ao carregar memórias:', error);
                galleryContainer.innerHTML = '<p class="error-loading">Não foi possível carregar as memórias. Tente novamente mais tarde.</p>';
            } finally {
                loadingMessage.style.display = 'none'; // Esconde mensagem de carregamento
            }
        }

        // Lidar com o envio do formulário de upload
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Impede o envio padrão do formulário

            const formData = new FormData(uploadForm); // Coleta todos os dados do formulário, incluindo o arquivo
            const submitButton = uploadForm.querySelector('.submit-button');
            submitButton.disabled = true; // Desabilita o botão para evitar múltiplos envios
            submitButton.textContent = 'Adicionando...';

            try {
                // Usando a URL do back-end do Railway
                const response = await fetch(`${RENDER_API_URL}/api/memories`, {
                    method: 'POST',
                    body: formData // FormData envia como multipart/form-data
                });

                const result = await response.json();

                if (response.ok) {
                    showMessage(result.message, 'success');
                    uploadForm.reset(); // Limpa o formulário
                    loadMemories(); // Recarrega a galeria para mostrar a nova foto
                } else {
                    throw new Error(result.error || 'Erro desconhecido ao adicionar memória.');
                }
            } catch (error) {
                console.error('Erro no upload:', error);
                showMessage(error.message, 'error');
            } finally {
                submitButton.disabled = false; // Habilita o botão
                submitButton.textContent = 'Adicionar Memória';
            }
        });

        // Carrega as memórias ao carregar a página
        loadMemories();
    }
});