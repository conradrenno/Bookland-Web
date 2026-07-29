# Style Brief :

Este é um site de e-commerce de livraria com identidade editorial clássica. A estética remete a livrarias físicas tradicionais e capas de livro de qualidade: tons terrosos e quentes, tipografia serifada para títulos, bastante espaço em branco (respiro), texturas sutis, cantos discretamente arredondados (não estilo "app plástico"). Evitar gradientes vibrantes, neon, glassmorphism ou visual "SaaS moderno". A referência é mais livraria/biblioteca de bairro sofisticada do que startup de tecnologia.

Hierarquia visual: título do livro > autor > preço > CTA.

Landing page deve conter produtos/livros em cards com paginação.

> **Capa do livro:** cada card e a página de detalhe exibem a capa
> (`BookViewModel.coverImageUrl`) como âncora visual, acima do título. Proporção
> de capa consistente (~2:3); quando não houver imagem, usar um placeholder
> editorial (nada de imagem quebrada). Detalhes técnicos em
> [03-catalog.md](03-catalog.md) e [12-config-tailwinds.md](12-config-tailwinds.md).
